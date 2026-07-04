import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseSkillMd } from './frontmatter.js';
import { hasManifest, loadManifest } from './manifest.js';
import type { SkillEntry, SkillKind, SkillTree } from './types.js';

const SKILL_MD = 'SKILL.md';
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);

/**
 * Load a skill tree from a directory.
 *
 * Structured mode: `root` contains skillfw.yaml — skills live under
 * `<skills_dir>/domains/<domain>/<skill>` and `<skills_dir>/orchestrators/<skill>`,
 * shared knowledge under `<skills_dir>/references/`.
 *
 * Generic mode: any directory of skills (e.g. an existing `.claude/skills`) —
 * every directory containing a SKILL.md is treated as a skill.
 */
export function loadTree(root: string): SkillTree {
  const absRoot = path.resolve(root);
  if (!existsSync(absRoot) || !statSync(absRoot).isDirectory()) {
    throw new Error(`Not a directory: ${absRoot}`);
  }
  if (hasManifest(absRoot)) {
    return loadStructuredTree(absRoot);
  }
  return loadGenericTree(absRoot);
}

function loadStructuredTree(root: string): SkillTree {
  const manifest = loadManifest(root);
  const skillsDir = path.join(root, manifest.skills_dir);
  const skills: SkillEntry[] = [];
  const emptySkillDirs: string[] = [];

  const domainsDir = path.join(skillsDir, 'domains');
  for (const domain of listDirs(domainsDir)) {
    const domainPath = path.join(domainsDir, domain);
    for (const skillFolder of listDirs(domainPath)) {
      const dir = path.join(domainPath, skillFolder);
      const entry = loadSkillDir(dir, root, 'domain', domain);
      if (entry) skills.push(entry);
      else emptySkillDirs.push(dir);
    }
  }

  const orchestratorsDir = path.join(skillsDir, 'orchestrators');
  for (const workflow of listDirs(orchestratorsDir)) {
    const dir = path.join(orchestratorsDir, workflow);
    const entry = loadSkillDir(dir, root, 'orchestrator');
    if (entry) skills.push(entry);
    else emptySkillDirs.push(dir);
  }

  const referencesDir = path.join(skillsDir, 'references');
  const sharedReferences = existsSync(referencesDir) ? listFilesRecursive(referencesDir) : [];

  return { root, structured: true, skillsDir, skills, sharedReferences, emptySkillDirs };
}

function loadGenericTree(root: string): SkillTree {
  const skills: SkillEntry[] = [];
  walk(root, root, skills);
  return {
    root,
    structured: false,
    skillsDir: root,
    skills,
    sharedReferences: [],
    emptySkillDirs: [],
  };
}

function walk(dir: string, root: string, out: SkillEntry[]): void {
  const hasSkillMd = hasExactSkillMd(dir);
  const misnamed = findMisnamed(dir);
  if (hasSkillMd || misnamed.length > 0) {
    const entry = loadSkillDir(dir, root, 'flat');
    if (entry) out.push(entry);
    return; // a skill dir does not contain nested skills
  }
  for (const sub of listDirs(dir)) {
    if (IGNORED_DIRS.has(sub) || sub.startsWith('.')) continue;
    walk(path.join(dir, sub), root, out);
  }
}

function loadSkillDir(
  dir: string,
  root: string,
  kind: SkillKind,
  domain?: string,
): SkillEntry | null {
  const skillMdPath = path.join(dir, SKILL_MD);
  const misnamed = findMisnamed(dir);
  const exists = hasExactSkillMd(dir);
  if (!exists && misnamed.length === 0 && kind === 'flat') return null;

  const base: SkillEntry = {
    dir,
    relDir: toPosix(path.relative(root, dir)),
    folderName: path.basename(dir),
    kind,
    domain,
    misnamed,
    frontmatter: null,
    hasFrontmatterBlock: false,
    body: '',
    bodyStartLine: 1,
  };

  // A structured skill dir with no SKILL.md at all is reported via
  // emptySkillDirs (SF001); dirs with only a misnamed file become entries.
  if (!exists && misnamed.length === 0) return null;

  if (exists) {
    const raw = readFileSync(skillMdPath, 'utf8');
    const parsed = parseSkillMd(raw);
    return {
      ...base,
      skillMdPath,
      raw,
      frontmatter: parsed.frontmatter,
      frontmatterError: parsed.frontmatterError,
      hasFrontmatterBlock: parsed.hasFrontmatterBlock,
      body: parsed.body,
      bodyStartLine: parsed.bodyStartLine,
    };
  }
  return base;
}

/**
 * True only when the directory contains a file named exactly `SKILL.md`.
 * existsSync would also match `skill.md` on case-insensitive filesystems
 * (macOS, Windows), silently defeating SF001's misnamed-file detection.
 */
function hasExactSkillMd(dir: string): boolean {
  return listFiles(dir).includes(SKILL_MD);
}

function findMisnamed(dir: string): string[] {
  const out: string[] = [];
  for (const f of listFiles(dir)) {
    if (f !== SKILL_MD && /^skills?\.mdx?$/i.test(f)) out.push(f);
  }
  return out;
}

export function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .sort();
}

export function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!IGNORED_DIRS.has(e.name) && !e.name.startsWith('.')) {
        out.push(...listFilesRecursive(p));
      }
    } else if (e.isFile()) {
      out.push(p);
    }
  }
  return out;
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
