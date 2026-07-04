import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { NAME_RE, UserError } from './core.js';

export const MANIFEST = 'skillfw.yaml';
export const LOCKFILE = 'skillfw.lock';

export interface Manifest {
  version: 1;
  name: string;
  skills_dir: string;
  targets: Record<string, { path: string }>;
  secrets: Record<string, string>;
  budgets: { skill_tokens: number; tree_tokens: number };
}

export interface FrontmatterContract {
  required: string[];
  allowed: string[] | null;
  patterns: Record<string, string>;
}

export type Severity = 'error' | 'warn' | 'off';
export interface LintConfig {
  rules: Record<string, Severity>;
  budgets: { skill_tokens?: number; tree_tokens?: number };
}

// Defaults match the Agent Skills spec exactly (name, description) so
// linting an arbitrary spec-valid tree has no false errors; sf projects
// additionally require version/memory/duration via scaffolded contracts.
export const DEFAULT_CONTRACT: FrontmatterContract = {
  required: ['name', 'description'],
  allowed: [
    'name', 'description', 'version', 'memory', 'duration', 'apis', 'secrets',
    'uses', 'allowed-tools', 'license', 'metadata', 'compatibility',
  ],
  patterns: {},
};

export const hasManifest = (root: string): boolean => existsSync(path.join(root, MANIFEST));

export function findProjectRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (hasManifest(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function parseYamlFile(file: string): unknown {
  try {
    return YAML.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new UserError(
      `${file} is not valid YAML.\nParser said: ${(err as Error).message}\nFix: correct the YAML syntax.`,
    );
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function loadManifest(root: string): Manifest {
  const file = path.join(root, MANIFEST);
  if (!existsSync(file)) {
    throw new UserError(
      `No ${MANIFEST} found in ${root}.\nFix: run \`sf init\`, or cd into a directory containing ${MANIFEST}.`,
    );
  }
  const doc = parseYamlFile(file);
  const fail = (msg: string): never => {
    throw new UserError(`${MANIFEST} failed validation (${file}): ${msg}\nFix: see docs/convention.md.`);
  };
  if (!isRecord(doc)) fail('manifest must be a YAML mapping');
  const d = doc as Record<string, unknown>;
  if (d.version !== 1) fail('`version` must be 1');
  const name = typeof d.name === 'string' && NAME_RE.test(d.name) ? d.name : fail('`name` must be lowercase-hyphenated');
  const rawSkillsDir = d.skills_dir === undefined ? 'skills' : d.skills_dir;
  const skills_dir =
    typeof rawSkillsDir === 'string' && rawSkillsDir !== '' ? rawSkillsDir : fail('`skills_dir` must be a non-empty string');

  const targets: Manifest['targets'] = {};
  if (d.targets !== undefined) {
    if (!isRecord(d.targets)) fail('`targets` must be a mapping');
    for (const [name, t] of Object.entries(d.targets as Record<string, unknown>)) {
      if (!isRecord(t) || typeof t.path !== 'string' || t.path === '') {
        fail(`targets.${name} must have a string \`path\``);
      }
      targets[name] = { path: (t as { path: string }).path };
    }
  }

  const secrets: Manifest['secrets'] = {};
  if (d.secrets !== undefined) {
    if (!isRecord(d.secrets)) fail('`secrets` must be a mapping');
    for (const [key, uri] of Object.entries(d.secrets as Record<string, unknown>)) {
      if (typeof uri === 'string' && /^[a-z][a-z0-9+.-]*:\/\//.test(uri)) secrets[key] = uri;
      else fail(`secrets.${key} must be a provider URI like env://VAR or file://./path`);
    }
  }

  const budgets = { skill_tokens: 2000, tree_tokens: 60000 };
  if (d.budgets !== undefined) {
    if (!isRecord(d.budgets)) fail('`budgets` must be a mapping');
    for (const key of ['skill_tokens', 'tree_tokens'] as const) {
      const v = (d.budgets as Record<string, unknown>)[key];
      if (v === undefined) continue;
      if (typeof v === 'number' && Number.isInteger(v) && v > 0) budgets[key] = v;
      else fail(`budgets.${key} must be a positive integer`);
    }
  }
  return { version: 1, name, skills_dir, targets, secrets, budgets };
}

export function loadContract(root: string): FrontmatterContract {
  const file = path.join(root, 'contracts', 'frontmatter.yaml');
  if (!existsSync(file)) return DEFAULT_CONTRACT;
  const doc = parseYamlFile(file) ?? {};
  if (!isRecord(doc)) throw new UserError(`${file} must be a YAML mapping.`);
  const out: FrontmatterContract = { ...DEFAULT_CONTRACT };
  if (Array.isArray(doc.required)) out.required = doc.required.map(String);
  if (Array.isArray(doc.allowed)) out.allowed = doc.allowed.map(String);
  if (isRecord(doc.patterns)) {
    out.patterns = Object.fromEntries(Object.entries(doc.patterns).map(([k, v]) => [k, String(v)]));
  }
  return out;
}

export function loadLintConfig(root: string): LintConfig {
  const file = path.join(root, 'contracts', 'lint.yaml');
  const out: LintConfig = { rules: {}, budgets: {} };
  if (!existsSync(file)) return out;
  const doc = parseYamlFile(file) ?? {};
  if (!isRecord(doc)) throw new UserError(`${file} must be a YAML mapping.`);
  if (isRecord(doc.rules)) {
    for (const [id, sev] of Object.entries(doc.rules)) {
      if (sev !== 'error' && sev !== 'warn' && sev !== 'off') {
        throw new UserError(`contracts/lint.yaml: rules.${id} must be error, warn, or off.`);
      }
      out.rules[id] = sev;
    }
  }
  if (isRecord(doc.budgets)) {
    for (const key of ['skill_tokens', 'tree_tokens'] as const) {
      const v = doc.budgets[key];
      if (v !== undefined) out.budgets[key] = Number(v);
    }
  }
  return out;
}

// --- Lockfile ---------------------------------------------------------------

export interface LockSkill { version: string; hash: string; files: string[] }
export interface LockTarget { path: string; skills: Record<string, LockSkill>; shared_files: string[] }
export interface Lockfile { version: 1; deployed_at: string; targets: Record<string, LockTarget> }

export function readLockfile(root: string): Lockfile | null {
  const file = path.join(root, LOCKFILE);
  if (!existsSync(file)) return null;
  const doc = parseYamlFile(file);
  if (!isRecord(doc) || doc.version !== 1 || !isRecord(doc.targets)) {
    throw new UserError(
      `${LOCKFILE} has an unexpected shape (${file}).\nFix: restore it from git or delete it and re-run \`sf deploy\`.`,
    );
  }
  return doc as unknown as Lockfile;
}

export function writeLockfile(root: string, lock: Lockfile): void {
  writeFileSync(path.join(root, LOCKFILE), YAML.stringify(lock), 'utf8');
}
