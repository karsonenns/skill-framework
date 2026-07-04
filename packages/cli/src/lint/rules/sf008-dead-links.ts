import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Rule, LintContext } from '../types.js';
import { relFile, readTextFile, lineOf } from '../util.js';
import { listFilesRecursive } from '../../core/tree.js';

// [text](target) and ![alt](target); target must not contain spaces or ')'.
const LINK_RE = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export const sf008: Rule = {
  id: 'SF008',
  defaultSeverity: 'error',
  description: 'Dead relative link (references/, scripts/, cross-skill)',
  check(ctx) {
    const seen = new Set<string>();
    for (const skill of ctx.tree.skills) {
      if (skill.skillMdPath) checkFile(ctx, skill.skillMdPath, seen);
      for (const sub of ['references', 'scripts']) {
        const dir = path.join(skill.dir, sub);
        if (!existsSync(dir)) continue;
        for (const f of listFilesRecursive(dir)) {
          if (f.endsWith('.md')) checkFile(ctx, f, seen);
        }
      }
    }
    for (const f of ctx.tree.sharedReferences) {
      if (f.endsWith('.md')) checkFile(ctx, f, seen);
    }
  },
};

function checkFile(ctx: LintContext, absPath: string, seen: Set<string>): void {
  if (seen.has(absPath)) return;
  seen.add(absPath);
  const text = readTextFile(absPath);
  if (text === null) return;
  for (const m of text.matchAll(LINK_RE)) {
    const target = m[1];
    if (!target || isExternal(target)) continue;
    const cleaned = target.split('#')[0];
    if (!cleaned) continue;
    const resolved = path.resolve(path.dirname(absPath), decodeURIComponent(cleaned));
    if (!existsSync(resolved)) {
      ctx.report({
        ruleId: 'SF008',
        file: relFile(ctx.tree, absPath),
        line: lineOf(text, m.index ?? 0),
        message: `Dead relative link \`${target}\` — resolves to ${resolved}, which does not exist.`,
        fix: 'Fix the path or create the missing file. Shared knowledge belongs in skills/references/.',
      });
    }
  }
}

function isExternal(target: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(target) || // http:, https:, mailto:, etc.
    target.startsWith('#') ||
    target.startsWith('/')
  );
}
