import type { Rule } from '../types.js';
import { relFile } from '../util.js';
import { frontmatterKeyLine } from '../../core/frontmatter.js';

const TRIGGER_PHRASES = [
  'use when',
  'use this',
  'use for',
  'use it',
  'use to',
  'when the',
  'when a',
  'when an',
  'when you',
  'when asked',
  'when working',
  'when handling',
  'trigger',
  'invoke',
  'applies to',
];

const ACTION_VERBS = new Set([
  'analyze', 'answer', 'audit', 'build', 'check', 'classify', 'compose', 'create',
  'debug', 'deploy', 'draft', 'escalate', 'evaluate', 'extract', 'find', 'fix',
  'generate', 'handle', 'investigate', 'manage', 'monitor', 'organize', 'plan',
  'prepare', 'process', 'produce', 'reconcile', 'refund', 'report', 'research',
  'resolve', 'respond', 'review', 'route', 'schedule', 'search', 'summarize',
  'track', 'triage', 'troubleshoot', 'update', 'validate', 'verify', 'write',
]);

export const sf007: Rule = {
  id: 'SF007',
  defaultSeverity: 'warn',
  description: 'Description too short or lacks trigger language (heuristic, no LLM)',
  check(ctx) {
    for (const skill of ctx.tree.skills) {
      if (!skill.skillMdPath || !skill.frontmatter) continue;
      const desc = skill.frontmatter.description;
      if (typeof desc !== 'string' || desc === '') continue; // SF003's job
      const file = relFile(ctx.tree, skill.skillMdPath);
      const line = skill.raw ? frontmatterKeyLine(skill.raw, 'description') : undefined;
      if (desc.trim().length < 20) {
        ctx.report({
          ruleId: 'SF007',
          file,
          line,
          message: `Description is only ${desc.trim().length} characters — too short for an agent to decide when to load this skill.`,
          fix: 'Describe what the skill does AND when to use it, e.g. "Handle invoice disputes. Use when a customer contests a charge."',
        });
        continue;
      }
      if (!hasTriggerLanguage(desc)) {
        ctx.report({
          ruleId: 'SF007',
          file,
          line,
          message:
            'Description lacks trigger language — agents pick skills by description, so say when to use it.',
          fix: 'Add a trigger clause like "Use when …" or start with an action verb ("Handle …", "Draft …").',
        });
      }
    }
  },
};

export function hasTriggerLanguage(desc: string): boolean {
  const lower = desc.toLowerCase();
  if (TRIGGER_PHRASES.some((p) => lower.includes(p))) return true;
  const firstWord = lower.match(/[a-z]+/)?.[0];
  return firstWord !== undefined && ACTION_VERBS.has(firstWord);
}
