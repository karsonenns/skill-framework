import type { Rule } from '../types.js';
import { relFile } from '../util.js';
import { frontmatterKeyLine } from '../../core/frontmatter.js';

export const sf013: Rule = {
  id: 'SF013',
  defaultSeverity: 'warn',
  description: 'Orchestrator references a skill name that does not exist in the tree',
  check(ctx) {
    const names = new Set<string>();
    for (const skill of ctx.tree.skills) {
      const name = skill.frontmatter?.name;
      if (typeof name === 'string') names.add(name);
    }
    for (const skill of ctx.tree.skills) {
      if (skill.kind !== 'orchestrator' || !skill.skillMdPath || !skill.frontmatter) continue;
      const uses = skill.frontmatter.uses;
      if (!Array.isArray(uses)) continue;
      for (const ref of uses) {
        if (typeof ref !== 'string') continue;
        if (!names.has(ref)) {
          ctx.report({
            ruleId: 'SF013',
            file: relFile(ctx.tree, skill.skillMdPath),
            line: skill.raw ? frontmatterKeyLine(skill.raw, 'uses') : undefined,
            message: `Orchestrator \`uses: ${ref}\`, but no skill with that name exists in the tree.`,
            fix: 'Fix the name, or create the domain skill it composes.',
          });
        }
      }
    }
  },
};
