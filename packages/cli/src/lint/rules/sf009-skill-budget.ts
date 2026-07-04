import type { Rule } from '../types.js';
import { relFile } from '../util.js';
import { estimateTokens } from '../../core/tokens.js';

export const sf009: Rule = {
  id: 'SF009',
  defaultSeverity: 'warn',
  description: 'Skill body exceeds budgets.skill_tokens (estimate: chars/4)',
  check(ctx) {
    const budget = ctx.budgets.skill_tokens;
    for (const skill of ctx.tree.skills) {
      if (!skill.skillMdPath) continue;
      const tokens = estimateTokens(skill.body);
      if (tokens > budget) {
        ctx.report({
          ruleId: 'SF009',
          file: relFile(ctx.tree, skill.skillMdPath),
          line: skill.bodyStartLine,
          message: `Skill body is ~${tokens} tokens; budget is ${budget}. Oversized skills eat the context window of every agent that loads them.`,
          fix: 'Move detail into references/ files (loaded on demand) and keep SKILL.md to the essential procedure.',
        });
      }
    }
  },
};
