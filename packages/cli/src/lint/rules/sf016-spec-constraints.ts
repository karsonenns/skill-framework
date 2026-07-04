import type { Rule, LintContext } from '../types.js';
import type { SkillEntry } from '../../core/types.js';
import { relFile } from '../util.js';
import { frontmatterKeyLine } from '../../core/frontmatter.js';

/**
 * Field constraints from the Agent Skills specification
 * (https://agentskills.io/specification) beyond what SF003/SF004 cover:
 *   - description: max 1024 characters
 *   - compatibility: string, 1-500 characters
 *   - metadata: map of string keys to string values
 *   - allowed-tools: a space-separated string (not a YAML list)
 *   - license: a string
 */
export const sf016: Rule = {
  id: 'SF016',
  defaultSeverity: 'error',
  description: 'Frontmatter violates an Agent Skills spec constraint',
  check(ctx) {
    for (const skill of ctx.tree.skills) {
      if (!skill.skillMdPath || !skill.frontmatter) continue;
      const fm = skill.frontmatter;

      const desc = fm.description;
      if (typeof desc === 'string' && desc.length > 1024) {
        report(ctx, skill, 'description',
          `description is ${desc.length} characters; the spec caps it at 1024.`,
          'Tighten the description — detail belongs in the skill body.');
      }

      const compat = fm['compatibility'];
      if (compat !== undefined) {
        if (typeof compat !== 'string' || compat.length === 0) {
          report(ctx, skill, 'compatibility',
            '`compatibility` must be a non-empty string.',
            'Describe environment requirements in one string, or drop the field (most skills do not need it).');
        } else if (compat.length > 500) {
          report(ctx, skill, 'compatibility',
            `compatibility is ${compat.length} characters; the spec caps it at 500.`,
            'Shorten it to the essential environment requirements.');
        }
      }

      const metadata = fm['metadata'];
      if (metadata !== undefined) {
        if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
          report(ctx, skill, 'metadata',
            '`metadata` must be a mapping of string keys to string values.',
            'Use `metadata:\\n  author: example-org`.');
        } else {
          for (const [k, v] of Object.entries(metadata)) {
            if (typeof v !== 'string') {
              report(ctx, skill, 'metadata',
                `metadata.${k} is ${Array.isArray(v) ? 'a list' : typeof v}; the spec requires string values.`,
                `Quote it: \`${k}: "${String(v)}"\`.`);
            }
          }
        }
      }

      const tools = fm['allowed-tools'];
      if (tools !== undefined && typeof tools !== 'string') {
        report(ctx, skill, 'allowed-tools',
          '`allowed-tools` must be a space-separated string, not a YAML list.',
          'Write `allowed-tools: Bash(git:*) Read` on one line.');
      }

      const license = fm['license'];
      if (license !== undefined && typeof license !== 'string') {
        report(ctx, skill, 'license',
          '`license` must be a string (a license name or a bundled license file).',
          'Write e.g. `license: MIT`.');
      }
    }
  },
};

function report(
  ctx: LintContext,
  skill: SkillEntry,
  key: string,
  message: string,
  fix: string,
): void {
  ctx.report({
    ruleId: 'SF016',
    file: relFile(ctx.tree, skill.skillMdPath!),
    line: skill.raw ? frontmatterKeyLine(skill.raw, key) : undefined,
    message,
    fix,
  });
}
