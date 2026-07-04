import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { isValidSemver } from '../src/core/semver.js';
import { estimateTokens } from '../src/core/tokens.js';
import { parseSkillMd, frontmatterKeyLine } from '../src/core/frontmatter.js';
import { loadManifest, findProjectRoot } from '../src/core/manifest.js';
import { loadTree } from '../src/core/tree.js';
import { loadFrontmatterContract, loadLintConfig } from '../src/core/contracts.js';
import { UserError } from '../src/core/errors.js';
import { makeTmpDir, cleanup, writeTree, baseProject, skillMd, BASE_MANIFEST } from './helpers.js';

const tmps: string[] = [];
function tmp(): string {
  const dir = makeTmpDir();
  tmps.push(dir);
  return dir;
}
afterEach(() => {
  while (tmps.length) cleanup(tmps.pop()!);
});

describe('semver', () => {
  it('accepts valid versions', () => {
    for (const v of ['0.1.0', '1.0.0', '10.20.30', '1.2.3-alpha.1', '1.2.3+build.5']) {
      expect(isValidSemver(v), v).toBe(true);
    }
  });
  it('rejects invalid versions', () => {
    for (const v of ['1.0', '1', 'v1.0.0', '1.0.0.0', 'abc', '01.0.0', '']) {
      expect(isValidSemver(v), v).toBe(false);
    }
  });
});

describe('estimateTokens', () => {
  it('estimates chars/4, rounding up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('parseSkillMd', () => {
  it('parses frontmatter and body', () => {
    const parsed = parseSkillMd('---\nname: a\nversion: 1.0.0\n---\n\nBody here.\n');
    expect(parsed.frontmatter?.name).toBe('a');
    expect(parsed.hasFrontmatterBlock).toBe(true);
    expect(parsed.body).toContain('Body here.');
    expect(parsed.bodyStartLine).toBe(5);
  });
  it('reports missing frontmatter block', () => {
    const parsed = parseSkillMd('# Just markdown\n');
    expect(parsed.frontmatter).toBeNull();
    expect(parsed.hasFrontmatterBlock).toBe(false);
  });
  it('reports unparseable YAML without throwing', () => {
    const parsed = parseSkillMd('---\nname: [unclosed\n---\nbody\n');
    expect(parsed.frontmatter).toBeNull();
    expect(parsed.hasFrontmatterBlock).toBe(true);
    expect(parsed.frontmatterError).toBeTruthy();
  });
  it('reports non-mapping frontmatter', () => {
    const parsed = parseSkillMd('---\n- just\n- a list\n---\nbody\n');
    expect(parsed.frontmatter).toBeNull();
    expect(parsed.frontmatterError).toContain('mapping');
  });
  it('finds frontmatter key lines', () => {
    const raw = '---\nname: a\ndescription: b\n---\nbody\n';
    expect(frontmatterKeyLine(raw, 'name')).toBe(2);
    expect(frontmatterKeyLine(raw, 'description')).toBe(3);
    expect(frontmatterKeyLine(raw, 'missing')).toBeUndefined();
  });
});

describe('loadManifest', () => {
  it('loads a valid manifest with defaults', () => {
    const dir = tmp();
    writeTree(dir, { 'skillfw.yaml': 'version: 1\nname: acme-ops\n' });
    const m = loadManifest(dir);
    expect(m.name).toBe('acme-ops');
    expect(m.skills_dir).toBe('skills');
    expect(m.budgets.skill_tokens).toBe(2000);
    expect(m.budgets.tree_tokens).toBe(60000);
  });
  it('rejects a missing manifest with a helpful error', () => {
    const dir = tmp();
    expect(() => loadManifest(dir)).toThrow(UserError);
    expect(() => loadManifest(dir)).toThrow(/sf init/);
  });
  it('rejects invalid YAML', () => {
    const dir = tmp();
    writeTree(dir, { 'skillfw.yaml': 'version: [1\n' });
    expect(() => loadManifest(dir)).toThrow(/not valid YAML/);
  });
  it('rejects schema violations with field paths', () => {
    const dir = tmp();
    writeTree(dir, { 'skillfw.yaml': 'version: 2\nname: Bad Name\n' });
    expect(() => loadManifest(dir)).toThrow(/version/);
  });
  it('rejects non-URI secret values', () => {
    const dir = tmp();
    writeTree(dir, {
      'skillfw.yaml': 'version: 1\nname: a\nsecrets:\n  KEY: plaintextvalue\n',
    });
    expect(() => loadManifest(dir)).toThrow(/provider URI/);
  });
});

describe('findProjectRoot', () => {
  it('walks up to the manifest', () => {
    const dir = tmp();
    writeTree(dir, baseProject());
    const nested = path.join(dir, 'skills', 'domains', 'billing');
    expect(findProjectRoot(nested)).toBe(dir);
  });
  it('returns null outside a project', () => {
    const dir = tmp();
    expect(findProjectRoot(dir)).toBeNull();
  });
});

describe('loadTree', () => {
  it('loads a structured tree with domains, orchestrators, and shared references', () => {
    const dir = tmp();
    writeTree(dir, {
      ...baseProject(),
      'skills/orchestrators/month-end/SKILL.md': skillMd('month-end'),
      'skills/references/tone.md': '# Tone\n',
    });
    const tree = loadTree(dir);
    expect(tree.structured).toBe(true);
    expect(tree.skills).toHaveLength(2);
    const kinds = Object.fromEntries(tree.skills.map((s) => [s.folderName, s.kind]));
    expect(kinds['refund-request']).toBe('domain');
    expect(kinds['month-end']).toBe('orchestrator');
    expect(tree.skills.find((s) => s.kind === 'domain')?.domain).toBe('billing');
    expect(tree.sharedReferences).toHaveLength(1);
  });

  it('records structured skill dirs with no SKILL.md', () => {
    const dir = tmp();
    writeTree(dir, { ...baseProject(), 'skills/domains/billing/empty-one/': '' });
    const tree = loadTree(dir);
    expect(tree.emptySkillDirs).toHaveLength(1);
    expect(tree.emptySkillDirs[0]).toContain('empty-one');
  });

  it('loads a generic (non-sf) directory of skills', () => {
    const dir = tmp();
    writeTree(dir, {
      'my-skill/SKILL.md': skillMd('my-skill'),
      'nested/deeper/other-skill/SKILL.md': skillMd('other-skill'),
      'not-a-skill/notes.txt': 'hello',
    });
    const tree = loadTree(dir);
    expect(tree.structured).toBe(false);
    expect(tree.skills.map((s) => s.folderName).sort()).toEqual(['my-skill', 'other-skill']);
    expect(tree.skills.every((s) => s.kind === 'flat')).toBe(true);
  });

  it('detects misnamed skill files in generic mode', () => {
    const dir = tmp();
    writeTree(dir, { 'bad/skill.md': skillMd('bad') });
    const tree = loadTree(dir);
    expect(tree.skills).toHaveLength(1);
    expect(tree.skills[0]!.misnamed).toEqual(['skill.md']);
    expect(tree.skills[0]!.skillMdPath).toBeUndefined();
  });
});

describe('contracts', () => {
  it('falls back to spec-only required fields when files are absent', () => {
    const dir = tmp();
    const contract = loadFrontmatterContract(dir);
    // The Agent Skills spec requires only name and description; `version`
    // is an sf-project convention enforced via scaffolded contracts.
    expect(contract.required).toEqual(['name', 'description']);
    expect(loadLintConfig(dir).rules).toEqual({});
  });
  it('loads custom contract and lint config', () => {
    const dir = tmp();
    writeTree(dir, {
      'contracts/frontmatter.yaml': 'required: [name]\nallowed: [name, description]\n',
      'contracts/lint.yaml': 'rules:\n  SF007: error\nbudgets:\n  skill_tokens: 100\n',
    });
    expect(loadFrontmatterContract(dir).required).toEqual(['name']);
    const cfg = loadLintConfig(dir);
    expect(cfg.rules['SF007']).toBe('error');
    expect(cfg.budgets.skill_tokens).toBe(100);
  });
  it('rejects invalid lint config values', () => {
    const dir = tmp();
    writeTree(dir, { 'contracts/lint.yaml': 'rules:\n  SF007: banana\n' });
    expect(() => loadLintConfig(dir)).toThrow(/lint\.yaml/);
  });
});

describe('BASE_MANIFEST fixture', () => {
  it('is itself valid', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'skillfw.yaml'), BASE_MANIFEST);
    expect(loadManifest(dir).name).toBe('test-org');
  });
});
