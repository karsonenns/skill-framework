import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { UserError } from './errors.js';

export const LOCKFILE_NAME = 'skillfw.lock';

const lockSkillSchema = z.object({
  version: z.string(),
  hash: z.string(),
  files: z.array(z.string()).default([]),
});

const lockTargetSchema = z.object({
  path: z.string(),
  skills: z.record(z.string(), lockSkillSchema).default({}),
  shared_files: z.array(z.string()).default([]),
});

export const lockfileSchema = z.object({
  version: z.literal(1),
  deployed_at: z.string(),
  targets: z.record(z.string(), lockTargetSchema).default({}),
});

export type Lockfile = z.infer<typeof lockfileSchema>;
export type LockTarget = z.infer<typeof lockTargetSchema>;
export type LockSkill = z.infer<typeof lockSkillSchema>;

export function lockfilePath(root: string): string {
  return path.join(root, LOCKFILE_NAME);
}

export function readLockfile(root: string): Lockfile | null {
  const file = lockfilePath(root);
  if (!existsSync(file)) return null;
  let doc: unknown;
  try {
    doc = YAML.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new UserError(
      `${LOCKFILE_NAME} is not valid YAML (${file}).\n` +
        `Parser said: ${(err as Error).message}\n` +
        `Fix: restore the file from git (\`git checkout -- ${LOCKFILE_NAME}\`) or delete it and re-run \`sf deploy\`.`,
    );
  }
  const result = lockfileSchema.safeParse(doc);
  if (!result.success) {
    throw new UserError(
      `${LOCKFILE_NAME} has an unexpected shape (${file}).\n` +
        `Fix: restore it from git or delete it and re-run \`sf deploy\`.`,
    );
  }
  return result.data;
}

export function writeLockfile(root: string, lock: Lockfile): void {
  writeFileSync(lockfilePath(root), YAML.stringify(lock), 'utf8');
}
