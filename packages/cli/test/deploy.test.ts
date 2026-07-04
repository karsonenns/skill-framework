import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { planDeploy, applyDeploy, diffDeploy, checkSecrets } from '../src/deploy/engine.js';
import { loadManifest } from '../src/core/manifest.js';
import { loadTree } from '../src/core/tree.js';
import { readLockfile } from '../src/core/lockfile.js';
import { makeTmpDir, cleanup, writeTree, skillMd, type TreeFiles } from './helpers.js';

const MANIFEST = `version: 1
name: acme-ops
skills_dir: skills
targets:
  claude-code:
    path: .claude/skills
  cursor:
    path: .cursor/skills
secrets:
  API_TOKEN: env://SFW_DEPLOY_TEST_TOKEN
budgets:
  skill_tokens: 2000
  tree_tokens: 60000
`;

function fullProject(): TreeFiles {
  return {
    'skillfw.yaml': MANIFEST,
    'skills/domains/billing/invoice-dispute/SKILL.md': `---
name: invoice-dispute
description: Resolve invoice disputes. Use when a customer contests a charge.
version: 1.2.0
domain: billing
apis:
  - stripe
secrets:
  - API_TOKEN
---

# Invoice Dispute

Read the [playbook](references/playbook.md) and the
[tone guide](../../../references/tone.md), then also check
[ticket triage](../../support/ticket-triage/SKILL.md).
`,
    'skills/domains/billing/invoice-dispute/references/playbook.md':
      'Shared [tone guide](../../../../references/tone.md).\n',
    'skills/domains/billing/invoice-dispute/scripts/fetch.sh': {
      content: '#!/bin/sh\necho fetch\n',
      mode: 0o755,
    },
    'skills/domains/support/ticket-triage/SKILL.md': skillMd('ticket-triage'),
    'skills/orchestrators/escalation/SKILL.md': skillMd('escalation', {
      fmExtra: 'uses:\n  - invoice-dispute\n  - ticket-triage\n',
    }),
    'skills/references/tone.md': '# Tone\n',
  };
}

let dir: string;
beforeEach(() => {
  dir = makeTmpDir();
  writeTree(dir, fullProject());
  process.env['SFW_DEPLOY_TEST_TOKEN'] = 'tok';
});
afterEach(() => {
  cleanup(dir);
  delete process.env['SFW_DEPLOY_TEST_TOKEN'];
});

function deployAll(): void {
  const plan = planDeploy(dir, []);
  expect(plan.lint.errorCount).toBe(0);
  applyDeploy(plan, '2026-07-04T00:00:00.000Z');
}

describe('planDeploy', () => {
  it('plans creates for a fresh target', () => {
    const plan = planDeploy(dir, ['claude-code']);
    expect(plan.targets).toHaveLength(1);
    const files = plan.targets[0]!.entries;
    expect(files.every((e) => e.action === 'create')).toBe(true);
    expect(files.map((e) => e.file)).toContain('invoice-dispute/SKILL.md');
    expect(files.map((e) => e.file)).toContain('_shared/references/tone.md');
  });
  it('rejects unknown targets with configured list', () => {
    expect(() => planDeploy(dir, ['bogus'])).toThrow(/claude-code/);
  });
});

describe('applyDeploy', () => {
  it('flattens domains and orchestrators into the target', () => {
    deployAll();
    for (const skill of ['invoice-dispute', 'ticket-triage', 'escalation']) {
      expect(existsSync(path.join(dir, '.claude/skills', skill, 'SKILL.md'))).toBe(true);
      expect(existsSync(path.join(dir, '.cursor/skills', skill, 'SKILL.md'))).toBe(true);
    }
  });

  it('strips sf-specific frontmatter into an HTML comment and keeps the standard fields', () => {
    deployAll();
    const compiled = readFileSync(
      path.join(dir, '.claude/skills/invoice-dispute/SKILL.md'),
      'utf8',
    );
    const fmBlock = compiled.split('---')[1]!;
    expect(fmBlock).toContain('name: invoice-dispute');
    expect(fmBlock).toContain('version: 1.2.0');
    expect(fmBlock).not.toContain('apis');
    expect(fmBlock).not.toContain('secrets');
    expect(fmBlock).not.toContain('domain');
    expect(compiled).toContain('<!-- skillfw');
    expect(compiled).toContain('API_TOKEN');
    expect(compiled).toMatchSnapshot();
  });

  it('rewrites links so they resolve after flattening', () => {
    deployAll();
    const root = path.join(dir, '.claude/skills');
    const compiled = readFileSync(path.join(root, 'invoice-dispute/SKILL.md'), 'utf8');
    // own references keep their shape (normalized with ./)
    expect(compiled).toContain('(./references/playbook.md)');
    // shared references remap to _shared
    expect(compiled).toContain('(../_shared/references/tone.md)');
    // cross-skill links remap to the flattened sibling
    expect(compiled).toContain('(../ticket-triage/SKILL.md)');
    // and a reference file one level deeper remaps correctly too
    const ref = readFileSync(path.join(root, 'invoice-dispute/references/playbook.md'), 'utf8');
    expect(ref).toContain('(../../_shared/references/tone.md)');
    // every rewritten path actually exists on disk
    expect(existsSync(path.join(root, '_shared/references/tone.md'))).toBe(true);
    expect(existsSync(path.join(root, 'ticket-triage/SKILL.md'))).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('preserves script executability', () => {
    deployAll();
    const mode = statSync(path.join(dir, '.claude/skills/invoice-dispute/scripts/fetch.sh')).mode;
    expect(mode & 0o111).not.toBe(0);
  });

  it('writes a lockfile with versions, hashes, and tracked files', () => {
    deployAll();
    const lock = readLockfile(dir)!;
    expect(lock.version).toBe(1);
    const skill = lock.targets['claude-code']!.skills['invoice-dispute']!;
    expect(skill.version).toBe('1.2.0');
    expect(skill.hash).toMatch(/^sha256-/);
    expect(skill.files).toContain('invoice-dispute/SKILL.md');
  });

  it('is idempotent — second deploy plans zero changes', () => {
    deployAll();
    const plan = planDeploy(dir, []);
    expect(plan.targets.flatMap((t) => t.entries)).toEqual([]);
  });

  it('deletes files it wrote for skills removed from source, and only those', () => {
    deployAll();
    // an untracked file the user created inside the target
    const foreign = path.join(dir, '.claude/skills/hand-made.md');
    writeFileSync(foreign, 'mine\n');
    rmSync(path.join(dir, 'skills/orchestrators/escalation'), { recursive: true });
    const plan = planDeploy(dir, []);
    expect(plan.lint.errorCount).toBe(0);
    const deletes = plan.targets[0]!.entries.filter((e) => e.action === 'delete');
    expect(deletes.map((e) => e.file)).toContain('escalation/SKILL.md');
    applyDeploy(plan, '2026-07-04T01:00:00.000Z');
    expect(existsSync(path.join(dir, '.claude/skills/escalation'))).toBe(false);
    expect(existsSync(foreign)).toBe(true);
    const lock = readLockfile(dir)!;
    expect(lock.targets['claude-code']!.skills['escalation']).toBeUndefined();
  });
});

describe('checkSecrets', () => {
  it('maps secrets to the skills that use them', () => {
    const manifest = loadManifest(dir);
    const tree = loadTree(dir);
    const checks = checkSecrets(dir, manifest, tree);
    expect(checks).toHaveLength(1);
    expect(checks[0]!.key).toBe('API_TOKEN');
    expect(checks[0]!.usedBy).toEqual(['invoice-dispute']);
    expect(checks[0]!.ok).toBe(true);
  });
  it('fails loudly when a secret cannot resolve', () => {
    delete process.env['SFW_DEPLOY_TEST_TOKEN'];
    const checks = checkSecrets(dir, loadManifest(dir), loadTree(dir));
    expect(checks[0]!.ok).toBe(false);
    expect(checks[0]!.reason).toContain('SFW_DEPLOY_TEST_TOKEN');
  });
});

describe('diffDeploy', () => {
  it('reports no drift right after a deploy', () => {
    deployAll();
    expect(diffDeploy(dir).drift).toEqual([]);
  });

  it('detects stale skills when source changes', () => {
    deployAll();
    const src = path.join(dir, 'skills/domains/support/ticket-triage/SKILL.md');
    writeFileSync(src, readFileSync(src, 'utf8').replace('version: 0.1.0', 'version: 0.2.0'));
    const { drift } = diffDeploy(dir);
    const stale = drift.filter((d) => d.kind === 'stale' && d.skill === 'ticket-triage');
    expect(stale).toHaveLength(2); // both targets
    expect(stale[0]!.detail).toContain('0.2.0');
  });

  it('detects direct edits in the target', () => {
    deployAll();
    const compiled = path.join(dir, '.claude/skills/ticket-triage/SKILL.md');
    writeFileSync(compiled, readFileSync(compiled, 'utf8') + '\nEDITED IN TARGET\n');
    const { drift } = diffDeploy(dir);
    expect(
      drift.some((d) => d.kind === 'modified-in-target' && d.targetName === 'claude-code'),
    ).toBe(true);
  });

  it('detects missing files in the target', () => {
    deployAll();
    rmSync(path.join(dir, '.claude/skills/ticket-triage'), { recursive: true });
    const { drift } = diffDeploy(dir);
    expect(
      drift.some((d) => d.kind === 'missing-in-target' && d.skill === 'ticket-triage'),
    ).toBe(true);
  });

  it('detects never-deployed and removed-from-source skills', () => {
    deployAll();
    writeTree(dir, {
      'skills/domains/billing/brand-new/SKILL.md': skillMd('brand-new'),
    });
    rmSync(path.join(dir, 'skills/orchestrators/escalation'), { recursive: true });
    const { drift } = diffDeploy(dir);
    expect(drift.some((d) => d.kind === 'not-deployed' && d.skill === 'brand-new')).toBe(true);
    expect(
      drift.some((d) => d.kind === 'removed-from-source' && d.skill === 'escalation'),
    ).toBe(true);
  });
});

describe('deploy gate', () => {
  it('does not modify permissions expectations: lint errors abort planning consumers', () => {
    // Break the tree: duplicate name (error severity).
    writeTree(dir, {
      'skills/domains/support/invoice-dispute/SKILL.md': skillMd('invoice-dispute'),
    });
    const plan = planDeploy(dir, []);
    expect(plan.lint.errorCount).toBeGreaterThan(0);
  });
});
