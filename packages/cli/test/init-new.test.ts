import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runInit } from '../src/commands/init.js';
import { runNewDomain, runNewSkill, runNewOrchestrator } from '../src/commands/new.js';
import { lintPath } from '../src/lint/engine.js';
import { UserError } from '../src/core/errors.js';
import { makeTmpDir, cleanup } from './helpers.js';

const tmps: string[] = [];
function tmp(): string {
  const dir = makeTmpDir();
  tmps.push(dir);
  return dir;
}
afterEach(() => {
  while (tmps.length) cleanup(tmps.pop()!);
});

describe('sf init', () => {
  for (const archetype of ['saas', 'solo'] as const) {
    it(`--${archetype} scaffolds a tree that passes lint with zero findings`, () => {
      const dir = tmp();
      runInit(dir, { archetype, force: false });
      expect(existsSync(path.join(dir, 'skillfw.yaml'))).toBe(true);
      expect(existsSync(path.join(dir, '.gitignore'))).toBe(true);
      expect(existsSync(path.join(dir, '_gitignore'))).toBe(false);
      const result = lintPath(dir);
      expect(result.findings).toEqual([]);
    });
  }

  it('refuses a non-empty directory without --force', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'existing.txt'), 'hi');
    expect(() => runInit(dir, { archetype: 'saas', force: false })).toThrow(UserError);
    expect(() => runInit(dir, { archetype: 'saas', force: false })).toThrow(/--force/);
  });

  it('scaffolds into a non-empty directory with --force', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'existing.txt'), 'hi');
    runInit(dir, { archetype: 'solo', force: true });
    expect(existsSync(path.join(dir, 'skillfw.yaml'))).toBe(true);
    expect(existsSync(path.join(dir, 'existing.txt'))).toBe(true);
  });
});

describe('sf new', () => {
  it('creates domains, skills, and orchestrators that pass lint immediately', () => {
    const dir = tmp();
    runInit(dir, { archetype: 'solo', force: false });
    runNewDomain('finance', dir);
    expect(existsSync(path.join(dir, 'skills/domains/finance'))).toBe(true);
    runNewSkill('finance/expense-report', dir);
    runNewOrchestrator('quarter-close', dir);
    const result = lintPath(dir);
    expect(result.findings).toEqual([]);
    expect(existsSync(path.join(dir, 'skills/domains/finance/expense-report/SKILL.md'))).toBe(true);
    expect(existsSync(path.join(dir, 'skills/orchestrators/quarter-close/SKILL.md'))).toBe(true);
  });

  it('rejects bad names and missing domains with fix hints', () => {
    const dir = tmp();
    runInit(dir, { archetype: 'solo', force: false });
    expect(() => runNewDomain('Bad_Name', dir)).toThrow(/lowercase/);
    expect(() => runNewSkill('nope', dir)).toThrow(/<domain>\/<skill-name>/);
    expect(() => runNewSkill('ghost/some-skill', dir)).toThrow(/sf new domain ghost/);
  });

  it('refuses to run outside a project', () => {
    const dir = tmp();
    expect(() => runNewDomain('finance', dir)).toThrow(/skillfw.yaml/);
  });
});
