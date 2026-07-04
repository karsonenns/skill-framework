import pc from 'picocolors';
import { findProjectRoot, loadManifest, MANIFEST_FILENAME } from '../core/manifest.js';
import { UserError } from '../core/errors.js';

/** Manifest-only check. Throws UserError with details on failure. */
export function runValidate(cwd: string): void {
  const root = findProjectRoot(cwd);
  if (!root) {
    throw new UserError(
      `No ${MANIFEST_FILENAME} found in this directory or any parent.\n` +
        'Fix: cd into a skillfw project, or run `sf init` to create one.',
    );
  }
  const manifest = loadManifest(root);
  const targets = Object.keys(manifest.targets);
  const secrets = Object.keys(manifest.secrets);
  console.log(pc.green(`✓ ${MANIFEST_FILENAME} is valid`));
  console.log(`  name:    ${manifest.name}`);
  console.log(`  skills:  ${manifest.skills_dir}/`);
  console.log(`  targets: ${targets.length > 0 ? targets.join(', ') : '(none configured)'}`);
  console.log(`  secrets: ${secrets.length > 0 ? secrets.join(', ') : '(none declared)'}`);
  console.log(
    `  budgets: ${manifest.budgets.skill_tokens} tokens/skill, ${manifest.budgets.tree_tokens} tokens/tree`,
  );
}
