import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { manifestSchema, type Manifest } from '../schemas/manifest.js';
import { UserError } from './errors.js';

export const MANIFEST_FILENAME = 'skillfw.yaml';

export function manifestPath(root: string): string {
  return path.join(root, MANIFEST_FILENAME);
}

export function hasManifest(root: string): boolean {
  return existsSync(manifestPath(root));
}

/**
 * Load and validate skillfw.yaml from a project root.
 * Throws UserError with a precise message on any problem.
 */
export function loadManifest(root: string): Manifest {
  const file = manifestPath(root);
  if (!existsSync(file)) {
    throw new UserError(
      `No ${MANIFEST_FILENAME} found in ${root}.\n` +
        `Fix: run \`sf init\` to scaffold a project, or cd into a directory that contains ${MANIFEST_FILENAME}.`,
    );
  }
  let doc: unknown;
  try {
    doc = YAML.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new UserError(
      `${MANIFEST_FILENAME} is not valid YAML (${file}).\n` +
        `Parser said: ${(err as Error).message}\n` +
        `Fix: correct the YAML syntax at the location above.`,
    );
  }
  const result = manifestSchema.safeParse(doc);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new UserError(
      `${MANIFEST_FILENAME} failed validation (${file}):\n${issues}\n` +
        `Fix: see docs/convention.md for the manifest schema.`,
    );
  }
  return result.data;
}

/** Search upward from `start` for a directory containing skillfw.yaml. */
export function findProjectRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, MANIFEST_FILENAME))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
