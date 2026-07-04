import {
  chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import YAML from 'yaml';
import { listFilesRecursive, toPosix, UserError } from './core.js';
import {
  loadContract, loadLintConfig, loadManifest, readLockfile, writeLockfile,
  type Lockfile, type Manifest,
} from './config.js';
import { loadTree, SKILL_MD, type SkillEntry, type SkillTree } from './tree.js';
import { lintTree, type LintResult } from './lint.js';
import { verifySecret } from './secrets.js';

/** Known runtimes and their conventional output paths (all read plain SKILL.md). */
export const TARGETS: Record<string, string> = {
  'claude-code': '.claude/skills',
  codex: '.codex/skills',
  'gemini-cli': '.gemini/skills',
  cursor: '.cursor/skills',
};

/** skillfw governance fields — not Agent Skills spec. Stripped into an HTML
 *  comment on deploy; `version` becomes `metadata.version` (the spec's own
 *  pattern), so compiled frontmatter stays pure spec. */
const SF_FIELDS = ['domain', 'memory', 'duration', 'apis', 'secrets', 'uses'];
const SHARED = '_shared';

interface CFile { path: string; content: Buffer; executable: boolean }
interface CSkill { name: string; version: string; files: CFile[]; hash: string }
export interface Compiled { outputPath: string; skills: CSkill[]; sharedFiles: CFile[]; allFiles: CFile[] }

export function hashFiles(files: CFile[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(`${f.path}\0${createHash('sha256').update(f.content).digest('hex')}${f.executable ? '\0x' : '\0-'}\n`);
  }
  return `sha256-${h.digest('hex')}`;
}

/** Flatten every skill into `<name>/`, carry all its files, copy shared
 *  references into `_shared/`, and rewrite relative links so they still
 *  resolve after flattening. */
export function compileTree(tree: SkillTree, outputPath: string): Compiled {
  const sharedRoot = path.join(tree.skillsDir, 'references');
  const nameByDir = new Map(
    tree.skills.filter((s) => typeof s.frontmatter?.name === 'string').map((s) => [s.dir, s.frontmatter!.name as string]),
  );

  const within = (parent: string, child: string) => {
    const r = path.relative(parent, child);
    return r !== '' && !r.startsWith('..') && !path.isAbsolute(r);
  };
  const rewrite = (compiledPath: string, absSource: string, link: string): string => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#') || link.startsWith('/')) return link;
    const [p, ...anchor] = link.split('#');
    if (!p) return link;
    const abs = path.resolve(path.dirname(absSource), decodeURIComponent(p));
    let mapped: string | null = within(sharedRoot, abs)
      ? `${SHARED}/references/${toPosix(path.relative(sharedRoot, abs))}`
      : null;
    if (!mapped) {
      for (const [dir, name] of nameByDir) {
        if (within(dir, abs)) { mapped = `${name}/${toPosix(path.relative(dir, abs))}`; break; }
      }
    }
    if (!mapped) return link;
    let out = path.posix.relative(path.posix.dirname(compiledPath), mapped);
    if (!out.startsWith('.')) out = `./${out}`;
    return out + (anchor.length ? `#${anchor.join('#')}` : '');
  };
  const rewriteMd = (text: string, compiledPath: string, absSource: string) =>
    text.replace(/(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (whole, pre: string, link: string, post: string) => {
      const r = rewrite(compiledPath, absSource, link);
      return r === link ? whole : `${pre}${r}${post}`;
    });
  const makeFile = (outPath: string, absSource: string): CFile => {
    const content = absSource.endsWith('.md')
      ? Buffer.from(rewriteMd(readFileSync(absSource, 'utf8'), outPath, absSource), 'utf8')
      : readFileSync(absSource);
    return {
      path: outPath, content,
      executable: process.platform !== 'win32' && (statSync(absSource).mode & 0o111) !== 0,
    };
  };

  const skills: CSkill[] = [];
  for (const s of tree.skills) {
    const name = s.frontmatter?.name;
    if (!s.skillMdPath || !s.raw || typeof name !== 'string' || !name) continue;
    const files: CFile[] = [{
      path: `${name}/${SKILL_MD}`,
      content: Buffer.from(rewriteMd(compileSkillMd(s), `${name}/${SKILL_MD}`, s.skillMdPath), 'utf8'),
      executable: false,
    }];
    for (const abs of listFilesRecursive(s.dir)) {
      if (abs === s.skillMdPath) continue;
      files.push(makeFile(`${name}/${toPosix(path.relative(s.dir, abs))}`, abs));
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    const version = typeof s.frontmatter?.version === 'string' ? s.frontmatter.version : '0.0.0';
    skills.push({ name, version, files, hash: hashFiles(files) });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));

  const sharedFiles = tree.sharedReferences.map((abs) =>
    makeFile(`${SHARED}/references/${toPosix(path.relative(sharedRoot, abs))}`, abs));

  return { outputPath, skills, sharedFiles, allFiles: [...skills.flatMap((s) => s.files), ...sharedFiles] };
}

/** Compiled SKILL.md: spec fields in frontmatter, sf fields in a comment. */
export function compileSkillMd(s: SkillEntry): string {
  const kept: Record<string, unknown> = {};
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s.frontmatter!)) {
    if (SF_FIELDS.includes(k)) stripped[k] = v;
    else if (k !== 'version') kept[k] = v;
  }
  const version = s.frontmatter!.version;
  if (typeof version === 'string' || typeof version === 'number') {
    const meta = kept['metadata'];
    kept['metadata'] = {
      ...(meta !== null && typeof meta === 'object' && !Array.isArray(meta) ? (meta as object) : {}),
      version: String(version), // valid semver always round-trips as a YAML string
    };
  }
  if (Array.isArray(kept['allowed-tools'])) kept['allowed-tools'] = kept['allowed-tools'].map(String).join(' ');
  let out = `---\n${YAML.stringify(kept, { lineWidth: 0 }).trimEnd()}\n---\n`;
  if (Object.keys(stripped).length) out += `\n<!-- skillfw\n${YAML.stringify(stripped, { lineWidth: 0 }).trimEnd()}\n-->\n`;
  out += `\n${s.body.replace(/^\r?\n/, '')}`;
  return out.endsWith('\n') ? out : `${out}\n`;
}

// --- Plan / apply -----------------------------------------------------------

export interface PlanEntry { action: 'create' | 'update' | 'delete'; file: string }
export interface TargetPlan { targetName: string; outputPath: string; compiled: Compiled; entries: PlanEntry[] }
export interface DeployPlan { root: string; manifest: Manifest; tree: SkillTree; lint: LintResult; targets: TargetPlan[] }

export interface SecretCheck { key: string; reference: string; usedBy: string[]; ok: boolean; reason?: string }

export function checkSecrets(root: string, manifest: Manifest, tree: SkillTree): SecretCheck[] {
  const usedBy = new Map<string, string[]>();
  for (const s of tree.skills) {
    if (!Array.isArray(s.frontmatter?.secrets)) continue;
    for (const key of s.frontmatter.secrets) {
      if (typeof key === 'string') usedBy.set(key, [...(usedBy.get(key) ?? []), String(s.frontmatter.name ?? s.folderName)]);
    }
  }
  return Object.entries(manifest.secrets).map(([key, reference]) => ({
    key, reference, usedBy: usedBy.get(key) ?? [], ...verifySecret(reference, root),
  }));
}

/** Build the full plan (lint included). Pure read — writes nothing. */
export function planDeploy(root: string, requested: string[]): DeployPlan {
  const manifest = loadManifest(root);
  const tree = loadTree(root);
  const lint = lintTree(tree, manifest, loadContract(root), loadLintConfig(root));
  const lock = readLockfile(root);
  const names = requested.length ? requested : Object.keys(manifest.targets);
  if (!names.length) {
    throw new UserError('No deploy targets configured.\nFix: add e.g.\n  targets:\n    claude-code:\n      path: .claude/skills\nto skillfw.yaml.');
  }
  const targets = names.map((name) => {
    const def = manifest.targets[name];
    if (!def) {
      throw new UserError(
        `Target \`${name}\` is not configured in skillfw.yaml.\nConfigured: ${Object.keys(manifest.targets).join(', ') || '(none)'}.`,
      );
    }
    const compiled = compileTree(tree, def.path);
    const entries: PlanEntry[] = [];
    const compiledPaths = new Set(compiled.allFiles.map((f) => f.path));
    for (const f of compiled.allFiles) {
      const abs = path.join(root, def.path, f.path);
      if (!existsSync(abs)) entries.push({ action: 'create', file: f.path });
      else if (!readFileSync(abs).equals(f.content)) entries.push({ action: 'update', file: f.path });
    }
    const lockTarget = lock?.targets[name];
    if (lockTarget) {
      const tracked = [...Object.values(lockTarget.skills).flatMap((s) => s.files), ...lockTarget.shared_files];
      for (const relPath of tracked) {
        if (!compiledPaths.has(relPath) && existsSync(path.join(root, lockTarget.path, relPath))) {
          entries.push({ action: 'delete', file: relPath });
        }
      }
    }
    entries.sort((a, b) => a.file.localeCompare(b.file));
    return { targetName: name, outputPath: def.path, compiled, entries };
  });
  return { root, manifest, tree, lint, targets };
}

/** Apply: write/update, delete only lockfile-tracked strays, refresh lockfile. */
export function applyDeploy(plan: DeployPlan, deployedAt: string): void {
  const lock: Lockfile = readLockfile(plan.root) ?? { version: 1, deployed_at: deployedAt, targets: {} };
  lock.deployed_at = deployedAt;
  for (const tp of plan.targets) {
    const outDir = path.join(plan.root, tp.outputPath);
    const base = lock.targets[tp.targetName]?.path ?? tp.outputPath;
    for (const e of tp.entries) {
      if (e.action === 'delete') rmSync(path.join(plan.root, base, e.file), { force: true });
    }
    for (const f of tp.compiled.allFiles) {
      const abs = path.join(outDir, f.path);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, f.content);
      if (f.executable && process.platform !== 'win32') chmodSync(abs, 0o755);
    }
    pruneEmptyDirs(outDir);
    lock.targets[tp.targetName] = {
      path: tp.outputPath,
      skills: Object.fromEntries(tp.compiled.skills.map((s) => [
        s.name, { version: s.version, hash: s.hash, files: s.files.map((f) => f.path) },
      ])),
      shared_files: tp.compiled.sharedFiles.map((f) => f.path),
    };
  }
  writeLockfile(plan.root, lock);
}

function pruneEmptyDirs(dir: string): void {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) pruneEmptyDirs(path.join(dir, e.name));
  }
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
}

// --- Drift (sf diff) ---------------------------------------------------------

export type DriftKind = 'modified-in-target' | 'missing-in-target' | 'stale' | 'not-deployed' | 'removed-from-source';
export interface DriftEntry { targetName: string; skill: string; kind: DriftKind; detail: string }

/** Compare lockfile + source tree vs what's on disk in each target. */
export function diffDeploy(root: string): { drift: DriftEntry[]; lock: Lockfile | null } {
  const manifest = loadManifest(root);
  const tree = loadTree(root);
  const lock = readLockfile(root);
  if (!lock) return { drift: [], lock: null };
  const drift: DriftEntry[] = [];

  for (const [targetName, lockTarget] of Object.entries(lock.targets)) {
    const outputPath = manifest.targets[targetName]?.path ?? lockTarget.path;
    const compiled = compileTree(tree, outputPath);
    const byName = new Map(compiled.skills.map((s) => [s.name, s]));

    for (const [skill, ls] of Object.entries(lockTarget.skills)) {
      const source = byName.get(skill);
      if (!source) {
        drift.push({ targetName, skill, kind: 'removed-from-source',
          detail: `deployed at v${ls.version} but no longer in source — \`sf deploy\` will remove it` });
        continue;
      }
      if (source.hash !== ls.hash) {
        drift.push({ targetName, skill, kind: 'stale',
          detail: source.version !== ls.version
            ? `v${ls.version} deployed, v${source.version} in source`
            : `source changed since last deploy (still v${source.version})` });
      }
      const missing: string[] = [];
      const onDisk: CFile[] = [];
      for (const relPath of ls.files) {
        const abs = path.join(root, lockTarget.path, relPath);
        if (!existsSync(abs)) missing.push(relPath);
        else onDisk.push({
          path: relPath, content: readFileSync(abs),
          executable: process.platform !== 'win32' && (statSync(abs).mode & 0o111) !== 0,
        });
      }
      if (missing.length) {
        drift.push({ targetName, skill, kind: 'missing-in-target', detail: `missing: ${missing.join(', ')}` });
      } else if (hashFiles(onDisk) !== ls.hash) {
        drift.push({ targetName, skill, kind: 'modified-in-target',
          detail: 'compiled files were edited directly — edits will be overwritten on next deploy' });
      }
    }
    for (const s of compiled.skills) {
      if (!lockTarget.skills[s.name]) {
        drift.push({ targetName, skill: s.name, kind: 'not-deployed', detail: `v${s.version} in source but never deployed` });
      }
    }
  }
  drift.sort((a, b) => a.targetName.localeCompare(b.targetName) || a.skill.localeCompare(b.skill));
  return { drift, lock };
}
