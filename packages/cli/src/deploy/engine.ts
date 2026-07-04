import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  chmodSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { loadManifest } from '../core/manifest.js';
import { loadTree, toPosix } from '../core/tree.js';
import { loadFrontmatterContract, loadLintConfig } from '../core/contracts.js';
import { lintTree, type LintResult } from '../lint/engine.js';
import { readLockfile, writeLockfile, type Lockfile } from '../core/lockfile.js';
import { UserError } from '../core/errors.js';
import type { Manifest } from '../schemas/manifest.js';
import type { SkillTree } from '../core/types.js';
import { compileTree, hashFiles, type CompiledTarget } from './compile.js';
import { getTarget, type DeployTarget } from './targets/index.js';
import { verifySecret } from './secrets/index.js';

export type PlanAction = 'create' | 'update' | 'delete';

export interface PlanEntry {
  action: PlanAction;
  /** Path relative to the target output dir. */
  file: string;
}

export interface TargetPlan {
  targetName: string;
  outputPath: string;
  compiled: CompiledTarget;
  entries: PlanEntry[];
}

export interface DeployPlan {
  root: string;
  manifest: Manifest;
  tree: SkillTree;
  lint: LintResult;
  targets: TargetPlan[];
}

export interface SecretCheck {
  key: string;
  reference: string;
  usedBy: string[];
  ok: boolean;
  reason?: string;
}

/** Which secrets does the tree reference, and do they all resolve? */
export function checkSecrets(root: string, manifest: Manifest, tree: SkillTree): SecretCheck[] {
  const usedBy = new Map<string, string[]>();
  for (const skill of tree.skills) {
    const secrets = skill.frontmatter?.secrets;
    const name = skill.frontmatter?.name ?? skill.folderName;
    if (!Array.isArray(secrets)) continue;
    for (const key of secrets) {
      if (typeof key !== 'string') continue;
      usedBy.set(key, [...(usedBy.get(key) ?? []), String(name)]);
    }
  }
  const checks: SecretCheck[] = [];
  for (const [key, reference] of Object.entries(manifest.secrets)) {
    const result = verifySecret(reference, root);
    checks.push({ key, reference, usedBy: usedBy.get(key) ?? [], ok: result.ok, reason: result.reason });
  }
  return checks;
}

export function resolveTargets(manifest: Manifest, requested: string[]): Array<{ target: DeployTarget; outputPath: string }> {
  const names = requested.length > 0 ? requested : Object.keys(manifest.targets);
  if (names.length === 0) {
    throw new UserError(
      'No deploy targets configured.\n' +
        'Fix: add a `targets:` section to skillfw.yaml, e.g.\n' +
        '  targets:\n    claude-code:\n      path: .claude/skills',
    );
  }
  return names.map((name) => {
    const def = manifest.targets[name];
    if (!def) {
      throw new UserError(
        `Target \`${name}\` is not configured in skillfw.yaml.\n` +
          `Configured targets: ${Object.keys(manifest.targets).join(', ') || '(none)'}.\n` +
          `Fix: add it under \`targets:\` or drop --target ${name}.`,
      );
    }
    const target = getTarget(name) ?? { name, defaultPath: def.path };
    return { target, outputPath: def.path };
  });
}

/** Build the full deploy plan (lint included). Pure read — writes nothing. */
export function planDeploy(root: string, requestedTargets: string[]): DeployPlan {
  const manifest = loadManifest(root);
  const tree = loadTree(root);
  const lint = lintTree(tree, manifest, {
    contract: loadFrontmatterContract(root),
    config: loadLintConfig(root),
  });

  const lock = readLockfile(root);
  const targets: TargetPlan[] = [];
  for (const { target, outputPath } of resolveTargets(manifest, requestedTargets)) {
    const compiled = compileTree(tree, target, outputPath);
    targets.push({
      targetName: target.name,
      outputPath,
      compiled,
      entries: planTarget(root, compiled, lock),
    });
  }
  return { root, manifest, tree, lint, targets };
}

function planTarget(root: string, compiled: CompiledTarget, lock: Lockfile | null): PlanEntry[] {
  const outDir = path.join(root, compiled.outputPath);
  const entries: PlanEntry[] = [];
  const compiledPaths = new Set(compiled.allFiles.map((f) => f.path));

  for (const file of compiled.allFiles) {
    const abs = path.join(outDir, file.path);
    if (!existsSync(abs)) {
      entries.push({ action: 'create', file: file.path });
    } else if (!readFileSync(abs).equals(file.content)) {
      entries.push({ action: 'update', file: file.path });
    }
  }

  // Delete only files we previously wrote (tracked in the lockfile).
  const lockTarget = lock?.targets[compiled.target.name];
  if (lockTarget) {
    const tracked = [
      ...Object.values(lockTarget.skills).flatMap((s) => s.files),
      ...lockTarget.shared_files,
    ];
    for (const rel of tracked) {
      if (!compiledPaths.has(rel) && existsSync(path.join(root, lockTarget.path, rel))) {
        entries.push({ action: 'delete', file: rel });
      }
    }
  }

  entries.sort((a, b) => a.file.localeCompare(b.file));
  return entries;
}

/** Apply a plan: write/update/delete files and refresh the lockfile. */
export function applyDeploy(plan: DeployPlan, deployedAt: string): void {
  const lock: Lockfile = readLockfile(plan.root) ?? { version: 1, deployed_at: deployedAt, targets: {} };
  lock.deployed_at = deployedAt;

  for (const tp of plan.targets) {
    const outDir = path.join(plan.root, tp.outputPath);
    const lockTargetPath = lock.targets[tp.targetName]?.path;

    for (const entry of tp.entries) {
      if (entry.action === 'delete') {
        const base = lockTargetPath ?? tp.outputPath;
        rmSync(path.join(plan.root, base, entry.file), { force: true });
      }
    }
    for (const file of tp.compiled.allFiles) {
      const abs = path.join(outDir, file.path);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, file.content);
      if (file.executable && process.platform !== 'win32') chmodSync(abs, 0o755);
    }
    pruneEmptyDirs(outDir);

    lock.targets[tp.targetName] = {
      path: tp.outputPath,
      skills: Object.fromEntries(
        tp.compiled.skills.map((s) => [
          s.name,
          { version: s.version, hash: s.hash, files: s.files.map((f) => f.path) },
        ]),
      ),
      shared_files: tp.compiled.sharedFiles.map((f) => f.path),
    };
  }

  writeLockfile(plan.root, lock);
}

function pruneEmptyDirs(dir: string): void {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name));
  }
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Drift detection (sf diff)
// ---------------------------------------------------------------------------

export type DriftKind =
  | 'modified-in-target'
  | 'missing-in-target'
  | 'stale'
  | 'not-deployed'
  | 'removed-from-source';

export interface DriftEntry {
  targetName: string;
  skill: string;
  kind: DriftKind;
  detail: string;
}

/**
 * Compare lockfile + source tree vs. what's on disk in each target.
 *  - modified-in-target: someone edited compiled output directly
 *  - missing-in-target: compiled files were deleted
 *  - stale: source changed since last deploy
 *  - not-deployed: skill exists in source but not in the lockfile
 *  - removed-from-source: lockfile has a skill the source no longer does
 */
export function diffDeploy(root: string): { drift: DriftEntry[]; lock: Lockfile | null } {
  const manifest = loadManifest(root);
  const tree = loadTree(root);
  const lock = readLockfile(root);
  if (!lock) return { drift: [], lock: null };

  const drift: DriftEntry[] = [];
  for (const [targetName, lockTarget] of Object.entries(lock.targets)) {
    const targetDef = manifest.targets[targetName];
    const outputPath = targetDef?.path ?? lockTarget.path;
    const target = getTarget(targetName) ?? { name: targetName, defaultPath: outputPath };
    const compiled = compileTree(tree, target, outputPath);
    const compiledByName = new Map(compiled.skills.map((s) => [s.name, s]));

    for (const [skillName, lockSkill] of Object.entries(lockTarget.skills)) {
      const source = compiledByName.get(skillName);
      if (!source) {
        drift.push({
          targetName,
          skill: skillName,
          kind: 'removed-from-source',
          detail: `deployed at v${lockSkill.version} but no longer in the source tree — \`sf deploy\` will remove it`,
        });
        continue;
      }
      if (source.hash !== lockSkill.hash) {
        const versionNote =
          source.version !== lockSkill.version
            ? `v${lockSkill.version} deployed, v${source.version} in source`
            : `source changed since last deploy (still v${source.version})`;
        drift.push({ targetName, skill: skillName, kind: 'stale', detail: versionNote });
      }
      // Compare what's actually on disk against what we wrote.
      const diskState = hashOnDisk(root, lockTarget.path, lockSkill.files);
      if (diskState.missing.length > 0) {
        drift.push({
          targetName,
          skill: skillName,
          kind: 'missing-in-target',
          detail: `missing: ${diskState.missing.join(', ')}`,
        });
      } else if (diskState.hash !== lockSkill.hash) {
        drift.push({
          targetName,
          skill: skillName,
          kind: 'modified-in-target',
          detail: 'compiled files were edited directly — edits will be overwritten on next deploy',
        });
      }
    }

    for (const s of compiled.skills) {
      if (!lockTarget.skills[s.name]) {
        drift.push({
          targetName,
          skill: s.name,
          kind: 'not-deployed',
          detail: `v${s.version} in source but never deployed to ${targetName}`,
        });
      }
    }
  }

  drift.sort(
    (a, b) => a.targetName.localeCompare(b.targetName) || a.skill.localeCompare(b.skill),
  );
  return { drift, lock };
}

function hashOnDisk(
  root: string,
  targetPath: string,
  files: string[],
): { hash: string; missing: string[] } {
  const missing: string[] = [];
  const present: Array<{ path: string; content: Buffer; executable: boolean }> = [];
  for (const rel of files) {
    const abs = path.join(root, targetPath, rel);
    if (!existsSync(abs)) {
      missing.push(toPosix(rel));
      continue;
    }
    present.push({
      path: rel,
      content: readFileSync(abs),
      executable: process.platform !== 'win32' && (statSync(abs).mode & 0o111) !== 0,
    });
  }
  // Reuse the compile hash format.
  return { hash: hashFiles(present), missing };
}
