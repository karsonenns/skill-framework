import type { Rule } from '../types.js';
import { relFile } from '../util.js';
import { frontmatterKeyLine } from '../../core/frontmatter.js';
import { isValidSemver } from '../../core/semver.js';

export const sf006: Rule = {
  id: 'SF006',
  defaultSeverity: 'error',
  description: '`version` must be valid semver',
  check(ctx) {
    for (const skill of ctx.tree.skills) {
      if (!skill.skillMdPath || !skill.frontmatter) continue;
      const version = skill.frontmatter.version;
      if (version === undefined || version === null || version === '') continue; // SF003's job
      const asString = typeof version === 'string' ? version : String(version);
      if (typeof version !== 'string' || !isValidSemver(asString)) {
        ctx.report({
          ruleId: 'SF006',
          file: relFile(ctx.tree, skill.skillMdPath),
          line: skill.raw ? frontmatterKeyLine(skill.raw, 'version') : undefined,
          message: `\`version: ${asString}\` is not valid semver${typeof version !== 'string' ? ' (quote it — YAML parsed it as a number)' : ''}.`,
          fix: 'Use MAJOR.MINOR.PATCH, e.g. `version: 1.0.0` (quoted or unquoted, three segments).',
        });
      }
    }
  },
};
