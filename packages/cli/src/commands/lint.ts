import path from 'node:path';
import pc from 'picocolors';
import { lintPath } from '../lint/engine.js';
import { formatFindings, type LintFormat } from '../lint/format.js';
import { applySafeFixes } from '../lint/fix.js';
import { findProjectRoot } from '../core/manifest.js';

export interface LintCommandOptions {
  format: LintFormat;
  fix: boolean;
}

/** Returns the exit code: 1 if any error-severity findings remain, else 0. */
export function runLint(target: string | undefined, cwd: string, opts: LintCommandOptions): number {
  const dir = target ? path.resolve(cwd, target) : (findProjectRoot(cwd) ?? cwd);
  let result = lintPath(dir);

  if (opts.fix) {
    const applied = applySafeFixes(result, result.tree);
    if (applied.length > 0 && opts.format === 'pretty') {
      for (const a of applied) console.log(pc.green(`fixed: ${a}`));
      console.log('');
    }
    result = lintPath(dir); // re-lint after fixes
  }

  console.log(formatFindings(result, opts.format));
  return result.errorCount > 0 ? 1 : 0;
}
