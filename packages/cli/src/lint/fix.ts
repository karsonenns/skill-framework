import { chmodSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { LintResult } from './engine.js';
import type { SkillTree } from '../core/types.js';
import { suggestName } from './rules/sf004-name-matches-folder.js';

/**
 * Apply safe fixes only:
 *  - SF014: chmod +x scripts
 *  - SF004 (casing only): rewrite frontmatter `name` when lowercasing/hyphenating
 *    the existing value makes it match the folder name. Never renames folders.
 * Returns a description of each fix applied.
 */
export function applySafeFixes(result: LintResult, tree: SkillTree): string[] {
  const applied: string[] = [];
  for (const f of result.findings) {
    const abs = path.join(tree.root, f.file);
    if (f.ruleId === 'SF014') {
      const mode = statSync(abs).mode;
      chmodSync(abs, mode | 0o755);
      applied.push(`chmod +x ${f.file}`);
    }
    if (f.ruleId === 'SF004') {
      const skill = tree.skills.find((s) => s.skillMdPath === abs);
      const name = skill?.frontmatter?.name;
      if (skill?.skillMdPath && typeof name === 'string' && suggestName(name) === skill.folderName) {
        const raw = readFileSync(skill.skillMdPath, 'utf8');
        const fixed = raw.replace(
          /^(name\s*:\s*).*$/m,
          `$1${skill.folderName}`,
        );
        if (fixed !== raw) {
          writeFileSync(skill.skillMdPath, fixed, 'utf8');
          applied.push(`${f.file}: name -> ${skill.folderName}`);
        }
      }
    }
  }
  return [...new Set(applied)];
}
