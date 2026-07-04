import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Rule } from '../types.js';
import { relFile } from '../util.js';
import { listFilesRecursive } from '../../core/tree.js';

export const sf014: Rule = {
  id: 'SF014',
  defaultSeverity: 'warn',
  description: 'Script in scripts/ is not executable (non-Windows)',
  check(ctx) {
    if (process.platform === 'win32') return;
    for (const skill of ctx.tree.skills) {
      const scriptsDir = path.join(skill.dir, 'scripts');
      if (!existsSync(scriptsDir)) continue;
      for (const f of listFilesRecursive(scriptsDir)) {
        const mode = statSync(f).mode;
        if ((mode & 0o111) === 0) {
          ctx.report({
            ruleId: 'SF014',
            file: relFile(ctx.tree, f),
            message: 'Script is not executable — agents invoking it directly will fail.',
            fix: `Run \`chmod +x ${relFile(ctx.tree, f)}\` (or \`sf lint --fix\`).`,
          });
        }
      }
    }
  },
};
