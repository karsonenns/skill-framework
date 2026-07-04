import type { Rule } from '../types.js';
import { relFile } from '../util.js';
import { frontmatterKeyLine } from '../../core/frontmatter.js';

export const sf005: Rule = {
  id: 'SF005',
  defaultSeverity: 'error',
  description: 'Duplicate skill names in tree',
  check(ctx) {
    const seen = new Map<string, string>();
    for (const skill of ctx.tree.skills) {
      if (!skill.skillMdPath || !skill.frontmatter) continue;
      const name = skill.frontmatter.name;
      if (typeof name !== 'string' || name === '') continue;
      const file = relFile(ctx.tree, skill.skillMdPath);
      const first = seen.get(name);
      if (first) {
        ctx.report({
          ruleId: 'SF005',
          file,
          line: skill.raw ? frontmatterKeyLine(skill.raw, 'name') : undefined,
          message: `Duplicate skill name \`${name}\` (also declared in ${first}). Skill names must be unique across the tree — deploy flattens them into one namespace.`,
          fix: 'Rename one of the skills (folder and frontmatter name together).',
        });
      } else {
        seen.set(name, file);
      }
    }
  },
};
