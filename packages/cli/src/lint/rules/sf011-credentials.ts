import type { Rule, LintContext } from '../types.js';
import { relFile, readTextFile, lineOf } from '../util.js';
import { listFilesRecursive } from '../../core/tree.js';

interface CredentialPattern {
  name: string;
  re: RegExp;
}

// Values starting with $, <, { or ending in placeholder brackets are treated
// as references/placeholders, not credentials.
export const CREDENTIAL_PATTERNS: CredentialPattern[] = [
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Stripe live secret key', re: /\bsk_live_[A-Za-z0-9]{10,}\b/g },
  { name: 'secret key (sk-…)', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'GitHub personal access token', re: /\bghp_[A-Za-z0-9]{36}\b/g },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'bearer token', re: /\b[Bb]earer\s+[A-Za-z0-9\-._~+/]{25,}=*/g },
  { name: 'hardcoded password', re: /\bpassword\s*=\s*(?![$<{*])[^\s'"`]{6,}/gi },
];

export const sf011: Rule = {
  id: 'SF011',
  defaultSeverity: 'error',
  description: 'Hardcoded credential pattern in a skill file',
  check(ctx) {
    for (const skill of ctx.tree.skills) {
      for (const f of listFilesRecursive(skill.dir)) {
        scanFile(ctx, f);
      }
    }
    for (const f of ctx.tree.sharedReferences) {
      scanFile(ctx, f);
    }
  },
};

function scanFile(ctx: LintContext, absPath: string): void {
  const text = readTextFile(absPath);
  if (text === null) return;
  for (const { name, re } of CREDENTIAL_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      ctx.report({
        ruleId: 'SF011',
        file: relFile(ctx.tree, absPath),
        line: lineOf(text, m.index),
        message: `Possible hardcoded credential (${name}). Skills are shared and deployed — never embed secrets.`,
        fix: 'Remove the value. Declare the need in frontmatter `secrets:` and map it in skillfw.yaml (env:// or file://).',
      });
    }
  }
}
