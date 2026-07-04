import type { SkillTree } from '../core/types.js';
import type { Manifest } from '../schemas/manifest.js';
import type { FrontmatterContract, LintConfig, Severity } from '../schemas/contracts.js';

export interface Finding {
  ruleId: string;
  severity: Exclude<Severity, 'off'>;
  /** Path relative to the linted root, POSIX separators. */
  file: string;
  line?: number;
  message: string;
  /** How to fix it. */
  fix?: string;
}

export interface LintContext {
  tree: SkillTree;
  /** Present when linting inside a skillfw project. */
  manifest: Manifest | null;
  contract: FrontmatterContract;
  config: LintConfig;
  budgets: { skill_tokens: number; tree_tokens: number };
  /** Report a finding; severity is filled in by the engine. */
  report(finding: Omit<Finding, 'severity'>): void;
}

export interface Rule {
  id: string;
  defaultSeverity: Severity;
  description: string;
  check(ctx: LintContext): void;
}
