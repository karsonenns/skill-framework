import path from 'node:path';
import type { Rule } from '../types.js';
import { relFile } from '../util.js';

export const sf001: Rule = {
  id: 'SF001',
  defaultSeverity: 'error',
  description: 'SKILL.md missing or misnamed (must be exactly `SKILL.md`)',
  check(ctx) {
    for (const dir of ctx.tree.emptySkillDirs) {
      ctx.report({
        ruleId: 'SF001',
        file: relFile(ctx.tree, dir),
        message: 'Skill directory has no SKILL.md.',
        fix: 'Create a SKILL.md with name, description, and version frontmatter, or remove the directory.',
      });
    }
    for (const skill of ctx.tree.skills) {
      for (const bad of skill.misnamed) {
        ctx.report({
          ruleId: 'SF001',
          file: relFile(ctx.tree, path.join(skill.dir, bad)),
          message: `Skill file is named \`${bad}\`; the Agent Skills spec requires exactly \`SKILL.md\`.`,
          fix: `Rename ${bad} to SKILL.md.`,
        });
      }
    }
  },
};
