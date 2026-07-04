import type { Rule } from '../types.js';
import { relFile } from '../util.js';

export const sf003: Rule = {
  id: 'SF003',
  defaultSeverity: 'error',
  description: 'Missing required frontmatter field per contract',
  check(ctx) {
    for (const skill of ctx.tree.skills) {
      if (!skill.skillMdPath || !skill.frontmatter) continue;
      const file = relFile(ctx.tree, skill.skillMdPath);
      for (const field of ctx.contract.required) {
        const value = skill.frontmatter[field];
        if (value === undefined || value === null || value === '') {
          ctx.report({
            ruleId: 'SF003',
            file,
            line: 1,
            message: `Missing required frontmatter field \`${field}\`.`,
            fix: `Add \`${field}:\` to the frontmatter (required by contracts/frontmatter.yaml).`,
          });
        }
      }
    }
  },
};
