import type { Rule } from '../types.js';
import { relFile } from '../util.js';
import { frontmatterKeyLine } from '../../core/frontmatter.js';

const DEFAULT_NAME_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$';

export const sf004: Rule = {
  id: 'SF004',
  defaultSeverity: 'error',
  description: 'Folder name must equal frontmatter `name`; name must be lowercase-hyphenated',
  check(ctx) {
    const pattern = new RegExp(ctx.contract.patterns['name'] ?? DEFAULT_NAME_PATTERN);
    for (const skill of ctx.tree.skills) {
      if (!skill.skillMdPath || !skill.frontmatter) continue;
      const name = skill.frontmatter.name;
      if (typeof name !== 'string' || name === '') continue; // SF003's job
      const file = relFile(ctx.tree, skill.skillMdPath);
      const line = skill.raw ? frontmatterKeyLine(skill.raw, 'name') : undefined;
      if (!pattern.test(name)) {
        ctx.report({
          ruleId: 'SF004',
          file,
          line,
          message: `Skill name \`${name}\` is not lowercase-hyphenated (must match ${pattern}).`,
          fix: `Rename to something like \`${suggestName(name)}\` in both frontmatter and folder name.`,
        });
      }
      if (name.length > 64) {
        ctx.report({
          ruleId: 'SF004',
          file,
          line,
          message: `Skill name is ${name.length} characters; the Agent Skills spec caps names at 64.`,
          fix: 'Shorten the name (folder and frontmatter together).',
        });
      }
      if (name !== skill.folderName) {
        ctx.report({
          ruleId: 'SF004',
          file,
          line,
          message: `Folder is \`${skill.folderName}\` but frontmatter name is \`${name}\`; they must match.`,
          fix: `Rename the folder to \`${name}\` or change frontmatter name to \`${skill.folderName}\`.`,
        });
      }
    }
  },
};

export function suggestName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}
