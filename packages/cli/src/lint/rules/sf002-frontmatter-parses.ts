import type { Rule } from '../types.js';
import { relFile } from '../util.js';

export const sf002: Rule = {
  id: 'SF002',
  defaultSeverity: 'error',
  description: 'Frontmatter missing or unparseable YAML',
  check(ctx) {
    for (const skill of ctx.tree.skills) {
      if (!skill.skillMdPath) continue;
      const file = relFile(ctx.tree, skill.skillMdPath);
      if (!skill.hasFrontmatterBlock) {
        ctx.report({
          ruleId: 'SF002',
          file,
          line: 1,
          message: 'SKILL.md has no YAML frontmatter block.',
          fix: 'Start the file with `---`, add name/description/version, close with `---`.',
        });
      } else if (skill.frontmatter === null) {
        ctx.report({
          ruleId: 'SF002',
          file,
          line: 1,
          message: `Frontmatter is not valid YAML: ${skill.frontmatterError ?? 'parse error'}.`,
          fix: 'Fix the YAML between the `---` delimiters.',
        });
      }
    }
  },
};
