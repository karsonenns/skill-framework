import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { lintPath, formatFindings, applySafeFixes } from '../src/lint.js';
import { loadTree, parseSkillMd } from '../src/tree.js';
import { packageRoot } from '../src/core.js';
import { makeTree, project, skillMd } from './helpers.js';

const ids = (dir: string) => lintPath(dir).findings.map((f) => f.ruleId);
const find = (dir: string, id: string) => lintPath(dir).findings.find((f) => f.ruleId === id);
const has = (arr: string[], s: string) => arr.includes(s);

it('a clean deep-taxonomy project has zero findings', () => {
  assert.deepEqual(lintPath(makeTree(project())).findings, []);
});

it('parses frontmatter, body offsets, and non-mapping blocks', () => {
  const p = parseSkillMd('---\nname: a\nversion: 1.0.0\n---\n\nBody.\n');
  assert.equal(p.frontmatter?.name, 'a');
  assert.equal(p.bodyStartLine, 5);
  assert.equal(parseSkillMd('# no fm\n').hasFrontmatterBlock, false);
  assert.match(parseSkillMd('---\n- a list\n---\nx\n').frontmatterError!, /mapping/);
});

describe('rules', () => {
  it('SF001: empty leaf dirs and misnamed skill files', () => {
    assert.ok(has(ids(makeTree(project({ 'skills/domain/ground/ghost/': '' }))), 'SF001'));
    // Exact-name detection must survive case-insensitive filesystems (macOS).
    const generic = makeTree({ 'bad/skill.md': skillMd('bad') });
    const tree = loadTree(generic);
    assert.deepEqual(tree.skills[0]!.misnamed, ['skill.md']);
    assert.equal(tree.skills[0]!.skillMdPath, undefined);
    assert.ok(has(ids(generic), 'SF001'));
  });

  it('SF002/SF003: broken YAML and missing required fields', () => {
    const dir = makeTree(project({
      'skills/domain/a/bad-yaml/SKILL.md': '---\nname: [broken\n---\nx\n',
      'skills/domain/a/no-memory/SKILL.md': skillMd('no-memory', { memory: '' }),
    }));
    assert.ok(has(ids(dir), 'SF002'));
    assert.match(find(dir, 'SF003')!.message, /memory/);
  });

  it('SF004: folder mismatch, casing, and the 64-char spec cap', () => {
    const long = `x${'-very-long-segment'.repeat(4)}`;
    const dir = makeTree(project({
      'skills/domain/a/folder-a/SKILL.md': skillMd('name-b'),
      [`skills/domain/a/${long}/SKILL.md`]: skillMd(long),
    }));
    const msgs = lintPath(dir).findings.filter((f) => f.ruleId === 'SF004').map((f) => f.message);
    assert.ok(!msgs.some((m) => m.includes('lowercase-hyphenated'))); // long name is pattern-valid
    assert.ok(msgs.some((m) => m.includes('64')));
    assert.ok(msgs.some((m) => m.includes('they must match')));
  });

  it('SF005/SF006: duplicate names and bad semver', () => {
    const dir = makeTree(project({
      'skills/domain/other/b-212/SKILL.md': skillMd('b-212'),
      'skills/domain/a/bad-ver/SKILL.md': skillMd('bad-ver', { version: 'one' }),
    }));
    assert.ok(has(ids(dir), 'SF005'));
    assert.ok(has(ids(dir), 'SF006'));
  });

  it('SF007: short or trigger-less descriptions warn; verbs pass', () => {
    const dir = makeTree(project({
      'skills/domain/a/short/SKILL.md': skillMd('short', { description: 'Nope' }),
      'skills/domain/a/vague/SKILL.md': skillMd('vague', { description: 'General knowledge about various procedures here.' }),
      'skills/domain/a/verby/SKILL.md': skillMd('verby', { description: 'Reconcile monthly invoices against the ledger.' }),
    }));
    const files = lintPath(dir).findings.filter((f) => f.ruleId === 'SF007').map((f) => f.file);
    assert.ok(files.some((f) => f.includes('short')));
    assert.ok(files.some((f) => f.includes('vague')));
    assert.ok(!files.some((f) => f.includes('verby')));
  });

  it('SF008: dead relative links error; external and resolving links pass', () => {
    const dir = makeTree(project({
      'skills/domain/a/links/SKILL.md': skillMd('links', {}, 'See [x](references/gone.md) and [ok](https://example.com).'),
    }));
    const f = find(dir, 'SF008')!;
    assert.match(f.message, /gone\.md/);
    assert.ok(f.line! > 1);
  });

  it('SF009/SF010: budget overruns via lint.yaml overrides', () => {
    const dir = makeTree(project({
      'contracts/lint.yaml': 'budgets:\n  skill_tokens: 10\n  tree_tokens: 5\n',
      'skills/domain/a/fat/SKILL.md': skillMd('fat', {}, 'word '.repeat(50)),
    }));
    assert.ok(has(ids(dir), 'SF009'));
    assert.equal(find(dir, 'SF010')!.file, 'skillfw.yaml');
  });

  it('SF011: credential patterns error; placeholders pass', () => {
    const dir = makeTree(project({
      'skills/domain/a/leaky/SKILL.md': skillMd('leaky', {}, `Key ${'AKIA'}${'A'.repeat(16)} and password=hunter2secret`),
      'skills/domain/a/clean/SKILL.md': skillMd('clean', {}, 'Set password=$DB_PASSWORD or password=<yours>.'),
    }));
    const files = lintPath(dir).findings.filter((f) => f.ruleId === 'SF011').map((f) => f.file);
    assert.equal(files.filter((f) => f.includes('leaky')).length, 2);
    assert.ok(!files.some((f) => f.includes('clean')));
  });

  it('SF012: secrets must be declared in the manifest', () => {
    const dir = makeTree(project({ 'skills/domain/a/needy/SKILL.md': skillMd('needy', { secrets: '[UNDECLARED]' }) }));
    assert.match(find(dir, 'SF012')!.message, /UNDECLARED/);
  });

  it('SF013: outcome uses: must reference existing skills', () => {
    const dir = makeTree(project({ 'skills/outcome/flow/SKILL.md': skillMd('flow', { uses: '[ghost, b-212]' }) }));
    const findings = lintPath(dir).findings.filter((f) => f.ruleId === 'SF013');
    assert.equal(findings.length, 1);
    assert.match(findings[0]!.message, /ghost/);
  });

  it('SF014: non-executable scripts warn and --fix repairs', { skip: process.platform === 'win32' }, () => {
    const dir = makeTree(project({
      'skills/domain/a/scripted/SKILL.md': skillMd('scripted'),
      'skills/domain/a/scripted/scripts/run.sh': { content: '#!/bin/sh\n', mode: 0o644 },
    }));
    const result = lintPath(dir);
    assert.ok(result.findings.some((f) => f.ruleId === 'SF014'));
    assert.ok(applySafeFixes(result, result.tree).some((a) => a.includes('chmod')));
    assert.ok(!has(ids(dir), 'SF014'));
  });

  it('SF015: unknown fields flagged only when enabled', () => {
    const files = project({ 'skills/domain/a/extra/SKILL.md': skillMd('extra', { banana: 'yes' }) });
    assert.ok(!has(ids(makeTree(files)), 'SF015'));
    const dir = makeTree({ ...files, 'contracts/lint.yaml': 'rules:\n  SF015: warn\n' });
    assert.match(find(dir, 'SF015')!.message, /banana/);
  });

  it('SF016: Agent Skills spec constraints', () => {
    const dir = makeTree(project({
      'skills/domain/a/wordy/SKILL.md': skillMd('wordy', { description: `Use when asked. ${'Detail. '.repeat(150)}` }),
      'skills/domain/a/tools/SKILL.md': skillMd('tools', {}, '').replace('---\n\n', 'allowed-tools:\n  - Read\n---\n\n'),
      'skills/domain/a/meta/SKILL.md': skillMd('meta', { metadata: '{revision: 3}' }),
    }));
    const msgs = lintPath(dir).findings.filter((f) => f.ruleId === 'SF016').map((f) => f.message);
    assert.ok(msgs.some((m) => m.includes('1024')));
    assert.ok(msgs.some((m) => m.includes('space-separated')));
    assert.ok(msgs.some((m) => m.includes('revision')));
  });

  it('SF017: memory/duration enums come from the contract patterns', () => {
    const dir = makeTree(project({
      'skills/domain/a/psychic/SKILL.md': skillMd('psychic', { memory: 'telepathy', duration: 'forever' }),
    }));
    const findings = lintPath(dir).findings.filter((f) => f.ruleId === 'SF017');
    assert.equal(findings.length, 2);
    assert.equal(findings[0]!.severity, 'error');
  });

  it('severity overrides and off-switches apply', () => {
    const dir = makeTree(project({
      'contracts/lint.yaml': 'rules:\n  SF007: off\n',
      'skills/domain/a/short/SKILL.md': skillMd('short', { description: 'Nope' }),
    }));
    assert.ok(!has(ids(dir), 'SF007'));
  });
});

it('generic mode: a spec-minimal .claude/skills tree lints clean (no version/memory required)', () => {
  const dir = makeTree({
    'my-skill/SKILL.md': '---\nname: my-skill\ndescription: Extract text from PDFs. Use when handling PDFs.\n---\n\n# X\n',
  });
  assert.deepEqual(lintPath(dir).findings, []);
});

it('formats: json is machine-readable, github emits annotations, pretty summarizes', () => {
  const dir = makeTree(project({ 'skills/domain/a/short/SKILL.md': skillMd('short', { description: 'Nope' }) }));
  const result = lintPath(dir);
  assert.ok(JSON.parse(formatFindings(result, 'json')).warnCount >= 1);
  assert.match(formatFindings(result, 'github'), /^::warning file=.*SF007/m);
  assert.match(formatFindings(result, 'pretty'), /fix:/);
});

it('--fix rewrites frontmatter name casing when it matches the folder', () => {
  const dir = makeTree(project({ 'skills/domain/a/tax-report/SKILL.md': skillMd('Tax_Report') }));
  const result = lintPath(dir);
  applySafeFixes(result, result.tree);
  assert.deepEqual(lintPath(dir).findings.filter((f) => f.ruleId === 'SF004'), []);
});

it('manifest validation rejects bad shapes with fix hints', () => {
  assert.throws(() => lintPath(makeTree({ 'skillfw.yaml': 'version: 2\nname: Bad Name\n' })), /version/);
  assert.throws(() => lintPath(makeTree({ 'skillfw.yaml': 'version: 1\nname: a\nsecrets:\n  K: plaintext\n' })), /provider URI/);
});

it('the shipped starter archetype stays lint-clean', () => {
  const result = lintPath(path.join(packageRoot(), 'archetypes', 'starter'));
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.tree.skills.map((s) => s.kind).sort(), ['domain', 'domain', 'outcome']);
  assert.equal(result.tree.skills.find((s) => s.folderName === 'b-212')?.domainPath, 'transportation/aviation/rotary-wing');
});
