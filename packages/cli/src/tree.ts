import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { listDirs, listFiles, listFilesRecursive, toPosix } from './core.js';
import { hasManifest, loadManifest } from './config.js';

export const SKILL_MD = 'SKILL.md';

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  memory?: string;
  duration?: string;
  apis?: string[];
  secrets?: string[];
  uses?: string[];
  'allowed-tools'?: string | string[];
  [key: string]: unknown;
}

export interface SkillEntry {
  dir: string; // absolute
  relDir: string; // relative to tree root, POSIX
  folderName: string;
  kind: 'domain' | 'outcome' | 'flat';
  /** Taxonomy path under skills/domain/, e.g. "transportation/aviation". */
  domainPath?: string;
  skillMdPath?: string;
  misnamed: string[]; // e.g. ["skill.md"]
  raw?: string;
  frontmatter: SkillFrontmatter | null;
  frontmatterError?: string;
  hasFrontmatterBlock: boolean;
  body: string;
  bodyStartLine: number;
}

export interface SkillTree {
  root: string;
  structured: boolean;
  skillsDir: string;
  skills: SkillEntry[];
  sharedReferences: string[]; // skills/references/**, structured mode only
  emptySkillDirs: string[]; // leaf dirs that should hold a skill but don't
}

/** Parse SKILL.md into frontmatter + body. Never throws. */
export function parseSkillMd(raw: string) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: null, hasFrontmatterBlock: false, body: raw, bodyStartLine: 1 };
  const body = raw.slice(m[0].length);
  const bodyStartLine = m[0].split(/\r?\n/).length;
  try {
    const data: unknown = YAML.parse(m[1]!);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return {
        frontmatter: null,
        frontmatterError: 'frontmatter is not a YAML mapping',
        hasFrontmatterBlock: true,
        body,
        bodyStartLine,
      };
    }
    return { frontmatter: data as SkillFrontmatter, hasFrontmatterBlock: true, body, bodyStartLine };
  } catch (err) {
    return {
      frontmatter: null,
      frontmatterError: (err as Error).message.split('\n')[0],
      hasFrontmatterBlock: true,
      body: '',
      bodyStartLine: 1,
    };
  }
}

/** 1-based line of a frontmatter key in the raw file. */
export function frontmatterKeyLine(raw: string, key: string): number | undefined {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== '---') return undefined;
  for (let i = 1; i < lines.length && lines[i] !== '---'; i++) {
    if (lines[i]!.startsWith(`${key}:`)) return i + 1;
  }
  return undefined;
}

/**
 * Load a skill tree. Structured mode (root has skillfw.yaml): skills live at
 * any depth under `<skills_dir>/domain/` (a dir containing SKILL.md is a
 * skill; dirs above it are taxonomy) and `<skills_dir>/outcome/<name>/`;
 * shared knowledge in `<skills_dir>/references/`. Generic mode: any directory
 * of skills, e.g. an existing `.claude/skills`.
 */
export function loadTree(root: string): SkillTree {
  const absRoot = path.resolve(root);
  if (!existsSync(absRoot) || !statSync(absRoot).isDirectory()) {
    throw new Error(`Not a directory: ${absRoot}`);
  }
  const skills: SkillEntry[] = [];
  const emptySkillDirs: string[] = [];

  if (!hasManifest(absRoot)) {
    walk(absRoot, absRoot, 'flat', skills, emptySkillDirs, false);
    return { root: absRoot, structured: false, skillsDir: absRoot, skills, sharedReferences: [], emptySkillDirs };
  }

  const skillsDir = path.join(absRoot, loadManifest(absRoot).skills_dir);
  walk(path.join(skillsDir, 'domain'), absRoot, 'domain', skills, emptySkillDirs, true);
  for (const name of listDirs(path.join(skillsDir, 'outcome'))) {
    const dir = path.join(skillsDir, 'outcome', name);
    const entry = loadSkillDir(dir, absRoot, 'outcome');
    if (entry) skills.push(entry);
    else emptySkillDirs.push(dir);
  }
  const sharedReferences = listFilesRecursive(path.join(skillsDir, 'references'));
  return { root: absRoot, structured: true, skillsDir, skills, sharedReferences, emptySkillDirs };
}

function walk(
  dir: string,
  root: string,
  kind: SkillEntry['kind'],
  out: SkillEntry[],
  empty: string[],
  structured: boolean,
): void {
  if (!existsSync(dir)) return;
  // Exact-name check: existsSync('SKILL.md') would also match skill.md on
  // case-insensitive filesystems (macOS, Windows) and defeat SF001.
  if (listFiles(dir).includes(SKILL_MD) || findMisnamed(dir).length > 0) {
    const entry = loadSkillDir(dir, root, kind);
    if (entry) out.push(entry);
    return; // a skill dir does not contain nested skills
  }
  const subs = listDirs(dir);
  if (structured && subs.length === 0) {
    empty.push(dir); // leaf taxonomy dir with no SKILL.md
    return;
  }
  for (const sub of subs) walk(path.join(dir, sub), root, kind, out, empty, structured);
}

function loadSkillDir(dir: string, root: string, kind: SkillEntry['kind']): SkillEntry | null {
  const misnamed = findMisnamed(dir);
  const exists = listFiles(dir).includes(SKILL_MD);
  if (!exists && misnamed.length === 0) return null;
  const relDir = toPosix(path.relative(root, dir));
  const base: SkillEntry = {
    dir,
    relDir,
    folderName: path.basename(dir),
    kind,
    domainPath:
      kind === 'domain'
        ? relDir.replace(/^.*?domain\//, '').split('/').slice(0, -1).join('/')
        : undefined,
    misnamed,
    frontmatter: null,
    hasFrontmatterBlock: false,
    body: '',
    bodyStartLine: 1,
  };
  if (!exists) return base;
  const raw = readFileSync(path.join(dir, SKILL_MD), 'utf8');
  return { ...base, skillMdPath: path.join(dir, SKILL_MD), raw, ...parseSkillMd(raw) };
}

function findMisnamed(dir: string): string[] {
  return listFiles(dir).filter((f) => f !== SKILL_MD && /^skills?\.mdx?$/i.test(f));
}
