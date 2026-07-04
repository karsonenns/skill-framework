import type { Rule } from '../types.js';
import { relFile } from '../util.js';
import { frontmatterKeyLine } from '../../core/frontmatter.js';

export const sf012: Rule = {
  id: 'SF012',
  defaultSeverity: 'error',
  description: 'Frontmatter `secrets:` key not declared in skillfw.yaml `secrets:`',
  check(ctx) {
    if (!ctx.manifest) return; // nothing to verify against outside a project
    const declared = new Set(Object.keys(ctx.manifest.secrets));
    for (const skill of ctx.tree.skills) {
      if (!skill.skillMdPath || !skill.frontmatter) continue;
      const secrets = skill.frontmatter.secrets;
      if (!Array.isArray(secrets)) continue;
      for (const key of secrets) {
        if (typeof key !== 'string') continue;
        if (!declared.has(key)) {
          ctx.report({
            ruleId: 'SF012',
            file: relFile(ctx.tree, skill.skillMdPath),
            line: skill.raw ? frontmatterKeyLine(skill.raw, 'secrets') : undefined,
            message: `Skill declares secret \`${key}\`, but skillfw.yaml has no \`secrets.${key}\` mapping.`,
            fix: `Add \`${key}: env://${key}\` (or file://…) under \`secrets:\` in skillfw.yaml.`,
          });
        }
      }
    }
  },
};
