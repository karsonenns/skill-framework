import pc from 'picocolors';
import type { LintResult } from './engine.js';
import type { Finding } from './types.js';

export type LintFormat = 'pretty' | 'json' | 'github';

export function formatFindings(result: LintResult, format: LintFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(
        {
          findings: result.findings,
          errorCount: result.errorCount,
          warnCount: result.warnCount,
          skillCount: result.tree.skills.length,
        },
        null,
        2,
      );
    case 'github':
      return result.findings.map(githubAnnotation).join('\n');
    case 'pretty':
      return pretty(result);
  }
}

function githubAnnotation(f: Finding): string {
  const level = f.severity === 'error' ? 'error' : 'warning';
  const loc = f.line !== undefined ? `file=${f.file},line=${f.line}` : `file=${f.file}`;
  const msg = `${f.ruleId}: ${f.message}${f.fix ? ` Fix: ${f.fix}` : ''}`;
  // Escape per GitHub workflow-command rules.
  const escaped = msg.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return `::${level} ${loc},title=${f.ruleId}::${escaped}`;
}

function pretty(result: LintResult): string {
  const lines: string[] = [];
  let currentFile = '';
  for (const f of result.findings) {
    if (f.file !== currentFile) {
      if (currentFile !== '') lines.push('');
      lines.push(pc.underline(f.file));
      currentFile = f.file;
    }
    const sev =
      f.severity === 'error' ? pc.red('error') : pc.yellow('warn ');
    const loc = f.line !== undefined ? pc.dim(`:${f.line}`) : '';
    lines.push(`  ${sev}  ${pc.bold(f.ruleId)}${loc}  ${f.message}`);
    if (f.fix) lines.push(`         ${pc.dim(`fix: ${f.fix}`)}`);
  }
  if (result.findings.length > 0) lines.push('');
  const summary =
    result.findings.length === 0
      ? pc.green(`✓ ${result.tree.skills.length} skill(s), no problems`)
      : `${pc.red(`${result.errorCount} error(s)`)}, ${pc.yellow(`${result.warnCount} warning(s)`)} across ${result.tree.skills.length} skill(s)`;
  lines.push(summary);
  return lines.join('\n');
}
