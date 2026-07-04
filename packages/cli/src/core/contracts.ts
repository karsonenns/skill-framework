import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import {
  frontmatterContractSchema,
  lintConfigSchema,
  DEFAULT_FRONTMATTER_CONTRACT,
  DEFAULT_LINT_CONFIG,
  type FrontmatterContract,
  type LintConfig,
} from '../schemas/contracts.js';
import { UserError } from './errors.js';

/** Load contracts/frontmatter.yaml, falling back to sensible defaults. */
export function loadFrontmatterContract(root: string): FrontmatterContract {
  const file = path.join(root, 'contracts', 'frontmatter.yaml');
  if (!existsSync(file)) return DEFAULT_FRONTMATTER_CONTRACT;
  const doc = parseYamlFile(file);
  const result = frontmatterContractSchema.safeParse(doc ?? {});
  if (!result.success) {
    throw new UserError(
      `contracts/frontmatter.yaml failed validation (${file}):\n` +
        result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n') +
        `\nFix: allowed keys are required (list), allowed (list), patterns (map of field -> regex).`,
    );
  }
  return {
    ...result.data,
    allowed: result.data.allowed ?? DEFAULT_FRONTMATTER_CONTRACT.allowed,
  };
}

/** Load contracts/lint.yaml, falling back to defaults (all rules at default severity). */
export function loadLintConfig(root: string): LintConfig {
  const file = path.join(root, 'contracts', 'lint.yaml');
  if (!existsSync(file)) return DEFAULT_LINT_CONFIG;
  const doc = parseYamlFile(file);
  const result = lintConfigSchema.safeParse(doc ?? {});
  if (!result.success) {
    throw new UserError(
      `contracts/lint.yaml failed validation (${file}):\n` +
        result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n') +
        `\nFix: allowed keys are rules (map of SF0xx -> error|warn|off) and budgets.`,
    );
  }
  return result.data;
}

function parseYamlFile(file: string): unknown {
  try {
    return YAML.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new UserError(
      `${file} is not valid YAML.\nParser said: ${(err as Error).message}\nFix: correct the YAML syntax.`,
    );
  }
}
