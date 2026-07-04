import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintPath } from '../src/lint/engine.js';
import { formatFindings } from '../src/lint/format.js';
import { applySafeFixes } from '../src/lint/fix.js';
import { makeTmpDir, cleanup, writeTree, baseProject, skillMd, BASE_MANIFEST } from './helpers.js';

const tmps: string[] = [];
function project(files: Parameters<typeof writeTree>[1]): string {
  const dir = makeTmpDir();
  tmps.push(dir);
  writeTree(dir, files);
  return dir;
}
afterEach(() => {
  while (tmps.length) cleanup(tmps.pop()!);
});

function ruleIds(dir: string): string[] {
  return lintPath(dir).findings.map((f) => f.ruleId);
}

describe('clean tree', () => {
  it('produces zero findings', () => {
    const dir = project(baseProject());
    const result = lintPath(dir);
    expect(result.findings).toEqual([]);
  });
});

describe('SF001 SKILL.md present and exactly named', () => {
  it('flags structured skill dirs with no SKILL.md', () => {
    const dir = project({ ...baseProject(), 'skills/domains/billing/ghost/': '' });
    expect(ruleIds(dir)).toContain('SF001');
  });
  it('flags misnamed skill.md', () => {
    const dir = project({ 'bad/skill.md': skillMd('bad') });
    const result = lintPath(dir);
    expect(result.findings.some((f) => f.ruleId === 'SF001' && f.message.includes('skill.md'))).toBe(true);
  });
});

describe('SF002 frontmatter parses', () => {
  it('flags missing frontmatter block', () => {
    const dir = project({ ...baseProject({ 'skills/domains/billing/no-fm/SKILL.md': '# nope\n' }) });
    expect(ruleIds(dir)).toContain('SF002');
  });
  it('flags broken YAML', () => {
    const dir = project(
      baseProject({ 'skills/domains/billing/bad-yaml/SKILL.md': '---\nname: [broken\n---\nbody\n' }),
    );
    expect(ruleIds(dir)).toContain('SF002');
  });
});

describe('SF003 required fields', () => {
  it('flags a missing version when the project contract requires it', () => {
    const dir = project(
      baseProject({
        'contracts/frontmatter.yaml': 'required: [name, description, version]\n',
        'skills/domains/billing/no-version/SKILL.md':
          '---\nname: no-version\ndescription: Handle things. Use when asked to handle things.\n---\nbody\n',
      }),
    );
    const findings = lintPath(dir).findings.filter((f) => f.ruleId === 'SF003');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('version');
  });

  it('does not require version on a bare spec-valid tree (generic mode)', () => {
    const dir = project({
      'minimal-skill/SKILL.md':
        '---\nname: minimal-skill\ndescription: Extract text from PDFs. Use when handling PDF documents.\n---\n\n# Minimal\n\nSpec-minimal skill: name and description only.\n',
    });
    expect(lintPath(dir).findings).toEqual([]);
  });
});

describe('SF004 name matches folder, lowercase-hyphenated', () => {
  it('flags folder/name mismatch', () => {
    const dir = project(
      baseProject({ 'skills/domains/billing/folder-a/SKILL.md': skillMd('name-b') }),
    );
    expect(ruleIds(dir)).toContain('SF004');
  });
  it('flags non-lowercase names', () => {
    const dir = project(
      baseProject({ 'skills/domains/billing/badcase/SKILL.md': skillMd('BadCase') }),
    );
    const msgs = lintPath(dir).findings.filter((f) => f.ruleId === 'SF004');
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('SF005 duplicate names', () => {
  it('flags the same name in two domains', () => {
    const dir = project(
      baseProject({
        'skills/domains/support/refund-request/SKILL.md': skillMd('refund-request'),
      }),
    );
    const findings = lintPath(dir).findings.filter((f) => f.ruleId === 'SF005');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('refund-request');
  });
});

describe('SF006 semver', () => {
  it('flags a non-semver version', () => {
    const dir = project(
      baseProject({ 'skills/domains/billing/bad-ver/SKILL.md': skillMd('bad-ver', { version: 'one' }) }),
    );
    expect(ruleIds(dir)).toContain('SF006');
  });
  it('flags YAML-number versions and suggests quoting', () => {
    const dir = project(
      baseProject({ 'skills/domains/billing/num-ver/SKILL.md': skillMd('num-ver', { version: '1.0' }) }),
    );
    const f = lintPath(dir).findings.find((x) => x.ruleId === 'SF006');
    expect(f).toBeDefined();
  });
});

describe('SF007 description quality', () => {
  it('flags short descriptions', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/short-desc/SKILL.md': skillMd('short-desc', { description: 'Billing.' }),
      }),
    );
    const f = lintPath(dir).findings.find((x) => x.ruleId === 'SF007');
    expect(f?.severity).toBe('warn');
  });
  it('flags descriptions without trigger language', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/vague/SKILL.md': skillMd('vague', {
          description: 'General knowledge about our billing system and related procedures.',
        }),
      }),
    );
    expect(ruleIds(dir)).toContain('SF007');
  });
  it('accepts action-verb descriptions', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/verby/SKILL.md': skillMd('verby', {
          description: 'Reconcile monthly invoices against the ledger and flag mismatches.',
        }),
      }),
    );
    expect(ruleIds(dir)).not.toContain('SF007');
  });
});

describe('SF008 dead links', () => {
  it('flags links to missing files', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/dead-link/SKILL.md': skillMd('dead-link', {
          body: 'See [the playbook](references/playbook.md) for details.',
        }),
      }),
    );
    const f = lintPath(dir).findings.find((x) => x.ruleId === 'SF008');
    expect(f).toBeDefined();
    expect(f!.line).toBeGreaterThan(1);
  });
  it('accepts resolving links and external URLs', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/good-link/SKILL.md': skillMd('good-link', {
          body: 'See [playbook](references/playbook.md) and [site](https://example.com) and [tone](../../../references/tone.md).',
        }),
        'skills/domains/billing/good-link/references/playbook.md': '# ok\n',
        'skills/references/tone.md': '# tone\n',
      }),
    );
    expect(ruleIds(dir)).not.toContain('SF008');
  });
});

describe('SF009/SF010 budgets', () => {
  it('flags oversized skill bodies using lint.yaml budget override', () => {
    const dir = project(
      baseProject({
        'contracts/lint.yaml': 'budgets:\n  skill_tokens: 10\n',
        'skills/domains/billing/fat/SKILL.md': skillMd('fat', {
          body: 'word '.repeat(100),
        }),
      }),
    );
    expect(ruleIds(dir)).toContain('SF009');
  });
  it('flags total description budget overruns', () => {
    const dir = project(
      baseProject({ 'contracts/lint.yaml': 'budgets:\n  tree_tokens: 5\n' }),
    );
    const f = lintPath(dir).findings.find((x) => x.ruleId === 'SF010');
    expect(f).toBeDefined();
    expect(f!.file).toBe('skillfw.yaml');
  });
});

describe('SF011 hardcoded credentials', () => {
  it('flags AWS keys, stripe live keys, PEM blocks, and passwords', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/leaky/SKILL.md': skillMd('leaky', {
          body: `Use key ${'AKIA'}${'A'.repeat(16)} for access.`,
        }),
        'skills/domains/billing/leaky/references/creds.md':
          `key: ${'sk_live_'}${'a1b2c3d4e5'}\npassword=hunter2secret\n`,
        'skills/domains/billing/leaky/references/key.pem':
          '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n',
      }),
    );
    const findings = lintPath(dir).findings.filter((f) => f.ruleId === 'SF011');
    expect(findings.length).toBeGreaterThanOrEqual(4);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });
  it('does not flag env var references or placeholders', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/clean/SKILL.md': skillMd('clean', {
          body: 'Authenticate with the STRIPE_KEY env var. Set password=$DB_PASSWORD first, or password=<your-password>.',
        }),
      }),
    );
    expect(ruleIds(dir)).not.toContain('SF011');
  });
});

describe('SF012 secrets declared in manifest', () => {
  it('flags undeclared secret keys', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/needs-secret/SKILL.md': skillMd('needs-secret', {
          fmExtra: 'secrets:\n  - UNDECLARED_KEY\n',
        }),
      }),
    );
    const f = lintPath(dir).findings.find((x) => x.ruleId === 'SF012');
    expect(f).toBeDefined();
    expect(f!.message).toContain('UNDECLARED_KEY');
  });
  it('passes when the manifest declares the key', () => {
    const manifest = BASE_MANIFEST.replace('secrets: {}', 'secrets:\n  MY_KEY: env://MY_KEY');
    const dir = project({
      'skillfw.yaml': manifest,
      'skills/domains/billing/needs-secret/SKILL.md': skillMd('needs-secret', {
        fmExtra: 'secrets:\n  - MY_KEY\n',
      }),
    });
    expect(ruleIds(dir)).not.toContain('SF012');
  });
});

describe('SF013 orchestrator references', () => {
  it('flags uses: entries that do not exist', () => {
    const dir = project(
      baseProject({
        'skills/orchestrators/flow/SKILL.md': skillMd('flow', {
          fmExtra: 'uses:\n  - ghost-skill\n',
        }),
      }),
    );
    const f = lintPath(dir).findings.find((x) => x.ruleId === 'SF013');
    expect(f).toBeDefined();
    expect(f!.message).toContain('ghost-skill');
  });
  it('passes when the referenced skill exists', () => {
    const dir = project(
      baseProject({
        'skills/orchestrators/flow/SKILL.md': skillMd('flow', {
          fmExtra: 'uses:\n  - refund-request\n',
        }),
      }),
    );
    expect(ruleIds(dir)).not.toContain('SF013');
  });
});

describe('SF014 executable scripts', () => {
  it.skipIf(process.platform === 'win32')('flags non-executable scripts and --fix repairs them', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/refund-request/scripts/run.sh': {
          content: '#!/bin/sh\necho ok\n',
          mode: 0o644,
        },
      }),
    );
    const result = lintPath(dir);
    expect(result.findings.some((f) => f.ruleId === 'SF014')).toBe(true);
    const applied = applySafeFixes(result, result.tree);
    expect(applied.some((a) => a.includes('chmod'))).toBe(true);
    expect(lintPath(dir).findings.some((f) => f.ruleId === 'SF014')).toBe(false);
  });
});

describe('SF004 spec name length', () => {
  it('flags names over 64 characters', () => {
    const longName = `x${'-very-long-segment'.repeat(4)}`; // 73 chars, pattern-valid
    const dir = project(
      baseProject({ [`skills/domains/billing/${longName}/SKILL.md`]: skillMd(longName) }),
    );
    const f = lintPath(dir).findings.find(
      (x) => x.ruleId === 'SF004' && x.message.includes('64'),
    );
    expect(f).toBeDefined();
  });
});

describe('SF016 Agent Skills spec constraints', () => {
  it('flags descriptions over 1024 characters', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/wordy/SKILL.md': skillMd('wordy', {
          description: `Use when asked. ${'Very long detail. '.repeat(70)}`,
        }),
      }),
    );
    const f = lintPath(dir).findings.find((x) => x.ruleId === 'SF016');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.message).toContain('1024');
  });

  it('flags compatibility over 500 characters or non-string', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/compat/SKILL.md': skillMd('compat', {
          fmExtra: `compatibility: ${'needs stuff '.repeat(50)}\n`,
        }),
      }),
    );
    expect(
      lintPath(dir).findings.some((x) => x.ruleId === 'SF016' && x.message.includes('500')),
    ).toBe(true);
  });

  it('flags non-string metadata values', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/meta/SKILL.md': skillMd('meta', {
          fmExtra: 'metadata:\n  author: acme\n  revision: 3\n',
        }),
      }),
    );
    const f = lintPath(dir).findings.find((x) => x.ruleId === 'SF016');
    expect(f).toBeDefined();
    expect(f!.message).toContain('revision');
  });

  it('flags allowed-tools written as a YAML list', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/tools/SKILL.md': skillMd('tools', {
          fmExtra: 'allowed-tools:\n  - Read\n  - Bash\n',
        }),
      }),
    );
    const f = lintPath(dir).findings.find((x) => x.ruleId === 'SF016');
    expect(f).toBeDefined();
    expect(f!.message).toContain('space-separated');
  });

  it('accepts spec-conformant optional fields', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/conform/SKILL.md': skillMd('conform', {
          fmExtra:
            'license: Apache-2.0\ncompatibility: Requires git and network access\nmetadata:\n  author: acme\nallowed-tools: Bash(git:*) Read\n',
        }),
      }),
    );
    expect(ruleIds(dir)).not.toContain('SF016');
  });
});

describe('--fix name casing', () => {
  it('rewrites frontmatter name when lowercasing matches the folder', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/tax-report/SKILL.md': skillMd('Tax_Report'),
      }),
    );
    const result = lintPath(dir);
    expect(result.findings.some((f) => f.ruleId === 'SF004')).toBe(true);
    const applied = applySafeFixes(result, result.tree);
    expect(applied.some((a) => a.includes('tax-report'))).toBe(true);
    expect(lintPath(dir).findings.filter((f) => f.ruleId === 'SF004')).toEqual([]);
  });
});

describe('SF015 unknown fields (opt-in)', () => {
  it('is off by default', () => {
    const dir = project(
      baseProject({
        'skills/domains/billing/extra/SKILL.md': skillMd('extra', { fmExtra: 'banana: yes\n' }),
      }),
    );
    expect(ruleIds(dir)).not.toContain('SF015');
  });
  it('flags unknown fields when enabled', () => {
    const dir = project(
      baseProject({
        'contracts/lint.yaml': 'rules:\n  SF015: warn\n',
        'skills/domains/billing/extra/SKILL.md': skillMd('extra', { fmExtra: 'banana: yes\n' }),
      }),
    );
    const f = lintPath(dir).findings.find((x) => x.ruleId === 'SF015');
    expect(f).toBeDefined();
    expect(f!.message).toContain('banana');
  });
});

describe('severity configuration', () => {
  it('respects overrides and off switches', () => {
    const dir = project(
      baseProject({
        'contracts/lint.yaml': 'rules:\n  SF007: off\n',
        'skills/domains/billing/short/SKILL.md': skillMd('short', { description: 'Too short' }),
      }),
    );
    expect(ruleIds(dir)).not.toContain('SF007');
  });
});

describe('output formats', () => {
  it('emits machine-readable JSON', () => {
    const dir = project(
      baseProject({ 'skills/domains/billing/short/SKILL.md': skillMd('short', { description: 'Nope' }) }),
    );
    const out = JSON.parse(formatFindings(lintPath(dir), 'json'));
    expect(out.warnCount).toBeGreaterThanOrEqual(1);
    expect(out.findings[0]).toHaveProperty('ruleId');
    expect(out.findings[0]).toHaveProperty('file');
  });
  it('renders pretty output with rule ids, fix hints, and a summary', () => {
    const dir = project(
      baseProject({ 'skills/domains/billing/short/SKILL.md': skillMd('short', { description: 'Nope' }) }),
    );
    const out = formatFindings(lintPath(dir), 'pretty');
    expect(out).toContain('SF007');
    expect(out).toContain('fix:');
    expect(out).toMatch(/1 warning\(s\)/);
    const clean = formatFindings(lintPath(project(baseProject())), 'pretty');
    expect(clean).toContain('no problems');
  });
  it('emits GitHub annotations', () => {
    const dir = project(
      baseProject({ 'skills/domains/billing/short/SKILL.md': skillMd('short', { description: 'Nope' }) }),
    );
    const out = formatFindings(lintPath(dir), 'github');
    expect(out).toMatch(/^::warning file=.*SF007/m);
  });
});

describe('archetypes stay lint-clean', () => {
  const repoArchetypes = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../archetypes',
  );
  for (const archetype of ['saas', 'solo']) {
    it(`${archetype} archetype has zero findings`, () => {
      const result = lintPath(path.join(repoArchetypes, archetype));
      expect(result.findings).toEqual([]);
    });
  }
});
