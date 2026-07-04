import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyDeploy, checkSecrets, diffDeploy, planDeploy } from '../src/deploy.js';
import { lintPath } from '../src/lint.js';
import { loadManifest, readLockfile } from '../src/config.js';
import { loadTree } from '../src/tree.js';
import { verifySecret, parseDotenv } from '../src/secrets.js';
import { makeTree, skillMd, CONTRACT } from './helpers.js';

const FULL = {
  'skillfw.yaml': `version: 1
name: acme
targets:
  claude-code: { path: .claude/skills }
  cursor: { path: .cursor/skills }
secrets:
  API_TOKEN: env://SFW_TEST_TOKEN
`,
  'contracts/frontmatter.yaml': CONTRACT,
  'skills/domain/transportation/aviation/rotary-wing/b-212/SKILL.md': `---
name: b-212
description: Operate the B-212. Use when rotary-wing flight is required.
version: 1.2.0
memory: motor
duration: permanent
apis: [flight-ops]
secrets: [API_TOKEN]
---

# B-212

See [checklist](references/checklist.md), the shared
[brevity guide](../../../../../references/brevity.md), and
[hoist](../../../../operations/recovery/hoist/SKILL.md).
`,
  'skills/domain/transportation/aviation/rotary-wing/b-212/references/checklist.md':
    'Shared [brevity](../../../../../../references/brevity.md).\n',
  'skills/domain/transportation/aviation/rotary-wing/b-212/assets/loadout.txt': 'strop x2\n',
  'skills/domain/transportation/aviation/rotary-wing/b-212/scripts/notam.sh': {
    content: '#!/bin/sh\necho ok\n', mode: 0o755,
  },
  'skills/domain/operations/recovery/hoist/SKILL.md': skillMd('hoist'),
  'skills/outcome/extract-team/SKILL.md': skillMd('extract-team', { memory: 'judgment', uses: '[b-212, hoist]' }),
  'skills/references/brevity.md': '# Brevity\n',
};

let dir: string;
beforeEach(() => {
  dir = makeTree(FULL);
  process.env['SFW_TEST_TOKEN'] = 'tok';
});
afterEach(() => delete process.env['SFW_TEST_TOKEN']);

function deployAll(): void {
  const plan = planDeploy(dir, []);
  assert.equal(plan.lint.errorCount, 0);
  applyDeploy(plan, '2026-07-04T00:00:00.000Z');
}

describe('deploy', () => {
  it('plans creates for a fresh target and rejects unknown targets', () => {
    const files = planDeploy(dir, ['claude-code']).targets[0]!.entries;
    assert.ok(files.every((e) => e.action === 'create'));
    assert.ok(files.map((e) => e.file).includes('_shared/references/brevity.md'));
    assert.throws(() => planDeploy(dir, ['bogus']), /claude-code/);
  });

  it('flattens deep taxonomy into pure-spec skills, carrying every file', () => {
    deployAll();
    const base = path.join(dir, '.claude/skills');
    for (const skill of ['b-212', 'hoist', 'extract-team']) {
      assert.ok(existsSync(path.join(base, skill, 'SKILL.md')), skill);
    }
    const compiled = readFileSync(path.join(base, 'b-212/SKILL.md'), 'utf8');
    const fm = compiled.split('---')[1]!;
    // version -> metadata.version (spec pattern); sf fields -> comment.
    assert.ok(!/^version:|memory|duration|apis|secrets/m.test(fm));
    assert.match(fm, /^metadata:\n {2}version: 1\.2\.0$/m);
    assert.ok(compiled.includes('<!-- skillfw'));
    assert.ok(compiled.includes('API_TOKEN'));
    // links rewritten to resolve after flattening
    assert.ok(compiled.includes('(./references/checklist.md)'));
    assert.ok(compiled.includes('(../_shared/references/brevity.md)'));
    assert.ok(compiled.includes('(../hoist/SKILL.md)'));
    assert.ok(readFileSync(path.join(base, 'b-212/references/checklist.md'), 'utf8')
      .includes('(../../_shared/references/brevity.md)'));
    // assets and scripts carried; exec bit preserved
    assert.ok(existsSync(path.join(base, 'b-212/assets/loadout.txt')));
    if (process.platform !== 'win32') {
      assert.notEqual(statSync(path.join(base, 'b-212/scripts/notam.sh')).mode & 0o111, 0);
    }
    // the compiled output itself lints clean as a generic tree
    assert.deepEqual(lintPath(base).findings, []);
  });

  it('is idempotent, tracks files in the lockfile, and deletes only what it wrote', () => {
    deployAll();
    assert.deepEqual(planDeploy(dir, []).targets.flatMap((t) => t.entries), []);
    const lock = readLockfile(dir)!;
    assert.equal(lock.targets['claude-code']!.skills['b-212']!.version, '1.2.0');
    assert.match(lock.targets['claude-code']!.skills['b-212']!.hash, /^sha256-/);

    const foreign = path.join(dir, '.claude/skills/hand-made.md');
    writeFileSync(foreign, 'mine\n');
    rmSync(path.join(dir, 'skills/outcome/extract-team'), { recursive: true });
    const plan = planDeploy(dir, []);
    assert.equal(plan.lint.errorCount, 0);
    assert.ok(plan.targets[0]!.entries.filter((e) => e.action === 'delete').map((e) => e.file)
      .includes('extract-team/SKILL.md'));
    applyDeploy(plan, '2026-07-04T01:00:00.000Z');
    assert.ok(!existsSync(path.join(dir, '.claude/skills/extract-team')));
    assert.ok(existsSync(foreign));
    assert.equal(readLockfile(dir)!.targets['claude-code']!.skills['extract-team'], undefined);
  });

  it('lint errors surface in the plan (deploy gate)', () => {
    writeFileSync(
      path.join(dir, 'skills/domain/operations/recovery/hoist/SKILL.md'),
      skillMd('hoist', { version: 'nope' }),
    );
    assert.ok(planDeploy(dir, []).lint.errorCount > 0);
  });
});

describe('diff', () => {
  it('reports stale, modified-in-target, missing, not-deployed, removed-from-source', () => {
    deployAll();
    assert.deepEqual(diffDeploy(dir).drift, []);

    const src = path.join(dir, 'skills/domain/operations/recovery/hoist/SKILL.md');
    writeFileSync(src, readFileSync(src, 'utf8').replace('0.1.0', '0.2.0'));
    const compiled = path.join(dir, '.claude/skills/extract-team/SKILL.md');
    writeFileSync(compiled, `${readFileSync(compiled, 'utf8')}\nEDITED\n`);
    rmSync(path.join(dir, '.cursor/skills/hoist'), { recursive: true });
    mkdirSync(path.join(dir, 'skills/domain/ops2/new-one'), { recursive: true });
    writeFileSync(path.join(dir, 'skills/domain/ops2/new-one/SKILL.md'), skillMd('new-one'));

    const kinds = new Set(diffDeploy(dir).drift.map((d) => `${d.kind}:${d.skill}`));
    for (const expected of ['stale:hoist', 'modified-in-target:extract-team', 'missing-in-target:hoist', 'not-deployed:new-one']) {
      assert.ok(kinds.has(expected), expected);
    }

    rmSync(path.join(dir, 'skills/outcome/extract-team'), { recursive: true });
    assert.ok(diffDeploy(dir).drift.some((d) => d.kind === 'removed-from-source' && d.skill === 'extract-team'));
  });
});

describe('secrets', () => {
  it('checkSecrets maps usage and verifies resolvability', () => {
    const checks = checkSecrets(dir, loadManifest(dir), loadTree(dir));
    assert.equal(checks.length, 1);
    assert.equal(checks[0]!.key, 'API_TOKEN');
    assert.deepEqual(checks[0]!.usedBy, ['b-212']);
    assert.equal(checks[0]!.ok, true);
    delete process.env['SFW_TEST_TOKEN'];
    assert.match(checkSecrets(dir, loadManifest(dir), loadTree(dir))[0]!.reason!, /SFW_TEST_TOKEN/);
  });

  it('env:// falls back to .env; file:// enforces 0600; sf:// is reserved', () => {
    const root = makeTree({
      '.env': 'FROM_DOTENV="quoted"\n# comment\n',
      'tight.txt': { content: 'shh', mode: 0o600 },
      'loose.txt': { content: 'shh', mode: 0o644 },
    });
    assert.equal(verifySecret('env://FROM_DOTENV', root).ok, true);
    assert.match(verifySecret('env://MISSING_VAR', root).reason!, /\.env/);
    if (process.platform !== 'win32') {
      assert.equal(verifySecret('file://./tight.txt', root).ok, true);
      assert.match(verifySecret('file://./loose.txt', root).reason!, /chmod 600/);
    }
    assert.match(verifySecret('sf://org/key', root).reason!, /Skill Framework Cloud/);
    assert.match(verifySecret('vault://x', root).reason!, /env:\/\//);
    assert.equal(verifySecret('notauri', root).ok, false);
    assert.deepEqual(parseDotenv(path.join(root, '.env')), { FROM_DOTENV: 'quoted' });
  });
});
