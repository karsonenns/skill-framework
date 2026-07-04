// Copies the canonical archetypes from the repo root into the package so
// they ship with the npm tarball. The copy is gitignored; edit the root
// archetypes/ directory, never packages/cli/archetypes/.
import { cp, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pkgRoot = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const source = path.resolve(pkgRoot, '../../archetypes');
const dest = path.join(pkgRoot, 'archetypes');

try {
  await access(source);
} catch {
  console.error(`sync-archetypes: source not found at ${source}`);
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await cp(source, dest, { recursive: true });
console.log(`sync-archetypes: copied ${source} -> ${dest}`);
