import { loadTree } from '../core/tree.js';
import { hasManifest, loadManifest } from '../core/manifest.js';
import { loadFrontmatterContract, loadLintConfig } from '../core/contracts.js';
import { DEFAULT_FRONTMATTER_CONTRACT, DEFAULT_LINT_CONFIG } from '../schemas/contracts.js';
import type { Manifest } from '../schemas/manifest.js';
import type { SkillTree } from '../core/types.js';
import { ALL_RULES } from './rules/index.js';
import type { Finding, LintContext } from './types.js';

export interface LintResult {
  tree: SkillTree;
  findings: Finding[];
  errorCount: number;
  warnCount: number;
}

/**
 * Lint a directory. Works on skillfw projects (manifest + contracts honored)
 * and on any plain directory of skills (e.g. an existing .claude/skills).
 */
export function lintPath(target: string): LintResult {
  const tree = loadTree(target);
  const manifest = tree.structured && hasManifest(tree.root) ? loadManifest(tree.root) : null;
  const contract = tree.structured
    ? loadFrontmatterContract(tree.root)
    : DEFAULT_FRONTMATTER_CONTRACT;
  const config = tree.structured ? loadLintConfig(tree.root) : DEFAULT_LINT_CONFIG;
  return lintTree(tree, manifest, { contract, config });
}

export function lintTree(
  tree: SkillTree,
  manifest: Manifest | null,
  opts: {
    contract?: typeof DEFAULT_FRONTMATTER_CONTRACT;
    config?: typeof DEFAULT_LINT_CONFIG;
  } = {},
): LintResult {
  const contract = opts.contract ?? DEFAULT_FRONTMATTER_CONTRACT;
  const config = opts.config ?? DEFAULT_LINT_CONFIG;
  const budgets = {
    skill_tokens: config.budgets.skill_tokens ?? manifest?.budgets.skill_tokens ?? 2000,
    tree_tokens: config.budgets.tree_tokens ?? manifest?.budgets.tree_tokens ?? 60000,
  };

  const findings: Finding[] = [];
  for (const rule of ALL_RULES) {
    const severity = config.rules[rule.id] ?? rule.defaultSeverity;
    if (severity === 'off') continue;
    const ctx: LintContext = {
      tree,
      manifest,
      contract,
      config,
      budgets,
      report(f) {
        findings.push({ ...f, severity });
      },
    };
    rule.check(ctx);
  }

  findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.ruleId.localeCompare(b.ruleId),
  );

  return {
    tree,
    findings,
    errorCount: findings.filter((f) => f.severity === 'error').length,
    warnCount: findings.filter((f) => f.severity === 'warn').length,
  };
}
