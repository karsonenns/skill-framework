import { cpSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { UserError } from '../core/errors.js';
import { archetypesDir } from '../core/pkg.js';

export interface InitOptions {
  archetype: 'saas' | 'solo';
  force: boolean;
}

export function runInit(dir: string, opts: InitOptions): void {
  const dest = path.resolve(dir);
  const source = path.join(archetypesDir(), opts.archetype);
  if (!existsSync(source)) {
    throw new UserError(`Archetype \`${opts.archetype}\` not found at ${source}.`);
  }

  if (existsSync(dest)) {
    const entries = readdirSync(dest).filter((e) => e !== '.git');
    if (entries.length > 0 && !opts.force) {
      throw new UserError(
        `Directory ${dest} is not empty (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}).\n` +
          `Fix: run in an empty directory, pass a new directory name, or use --force to scaffold anyway.`,
      );
    }
  } else {
    mkdirSync(dest, { recursive: true });
  }

  cpSync(source, dest, { recursive: true, force: true });

  // npm strips .gitignore from published tarballs, so archetypes ship it
  // as `_gitignore` and init restores the real name.
  const gitignoreStub = path.join(dest, '_gitignore');
  if (existsSync(gitignoreStub)) {
    renameSync(gitignoreStub, path.join(dest, '.gitignore'));
  }

  console.log(pc.green(`✓ Scaffolded ${opts.archetype} skill tree in ${dest}`));
  console.log('');
  console.log('Next steps:');
  if (dir !== '.') console.log(`  cd ${dir}`);
  console.log('  sf lint            # should pass with zero findings');
  console.log('  sf deploy --dry-run');
}
