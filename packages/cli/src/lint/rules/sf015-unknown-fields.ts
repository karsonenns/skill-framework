import type { Rule } from '../types.js';
import { relFile } from '../util.js';
import { frontmatterKeyLine } from '../../core/frontmatter.js';

export const sf015: Rule = {
  id: 'SF015',
  defaultSeverity: 'off',
  description: 'Unknown frontmatter field not allowed by contract (off by default)',
  check(ctx) {
    const allowed = ctx.contract.allowed;
    if (!allowed) return;
    const allowedSet = new Set(allowed);
    for (const skill of ctx.tree.skills) {
      if (!skill.skillMdPath || !skill.frontmatter) continue;
      for (const key of Object.keys(skill.frontmatter)) {
        if (!allowedSet.has(key)) {
          ctx.report({
            ruleId: 'SF015',
            file: relFile(ctx.tree, skill.skillMdPath),
            line: skill.raw ? frontmatterKeyLine(skill.raw, key) : undefined,
            message: `Unknown frontmatter field \`${key}\` (not in contracts/frontmatter.yaml \`allowed\`).`,
            fix: `Remove the field, or add \`${key}\` to \`allowed\` in contracts/frontmatter.yaml.`,
          });
        }
      }
    }
  },
};
