import type { Rule } from '../types.js';
import { estimateTokens } from '../../core/tokens.js';
import { MANIFEST_FILENAME } from '../../core/manifest.js';

export const sf010: Rule = {
  id: 'SF010',
  defaultSeverity: 'warn',
  description: 'Sum of all frontmatter descriptions exceeds budgets.tree_tokens',
  check(ctx) {
    const budget = ctx.budgets.tree_tokens;
    let total = 0;
    for (const skill of ctx.tree.skills) {
      const desc = skill.frontmatter?.description;
      if (typeof desc === 'string') total += estimateTokens(desc);
    }
    if (total > budget) {
      ctx.report({
        ruleId: 'SF010',
        file: ctx.manifest ? MANIFEST_FILENAME : '.',
        message: `All skill descriptions together are ~${total} tokens; tree budget is ${budget}. Descriptions are always loaded — this is your fixed context tax.`,
        fix: 'Tighten descriptions, or raise budgets.tree_tokens in skillfw.yaml if the cost is intentional.',
      });
    }
  },
};
