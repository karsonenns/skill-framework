import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Absolute path to the installed skillfw package root (contains package.json). */
export function packageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('skillfw package root not found');
    dir = parent;
  }
}

export function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

/** Directory containing the shipped archetypes. */
export function archetypesDir(): string {
  const dir = path.join(packageRoot(), 'archetypes');
  if (!existsSync(dir)) {
    throw new Error(
      `Archetypes directory not found at ${dir}. ` +
        'In development, run `npm run sync-archetypes` first.',
    );
  }
  return dir;
}
