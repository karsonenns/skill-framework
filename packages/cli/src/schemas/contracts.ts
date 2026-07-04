import { z } from 'zod';

/** contracts/frontmatter.yaml — required/allowed frontmatter fields + regexes. */
export const frontmatterContractSchema = z
  .object({
    required: z.array(z.string()).default(['name', 'description']),
    allowed: z.array(z.string()).nullish(),
    patterns: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export type FrontmatterContract = z.infer<typeof frontmatterContractSchema>;

// Default required fields match the Agent Skills spec exactly (name and
// description) so `sf lint` on an arbitrary spec-valid tree has no false
// errors. sf projects additionally require `version` via the
// contracts/frontmatter.yaml that `sf init` scaffolds.
export const DEFAULT_FRONTMATTER_CONTRACT: FrontmatterContract = {
  required: ['name', 'description'],
  allowed: [
    'name',
    'description',
    'version',
    'domain',
    'apis',
    'secrets',
    'uses',
    'allowed-tools',
    'license',
    'metadata',
    'compatibility',
  ],
  patterns: {},
};

const severitySchema = z.enum(['error', 'warn', 'off']);
export type Severity = z.infer<typeof severitySchema>;

/** contracts/lint.yaml — rule enable/disable, severities, budget overrides. */
export const lintConfigSchema = z
  .object({
    rules: z.record(z.string(), severitySchema).default({}),
    budgets: z
      .object({
        skill_tokens: z.number().int().positive().optional(),
        tree_tokens: z.number().int().positive().optional(),
      })
      .default({}),
  })
  .strict();

export type LintConfig = z.infer<typeof lintConfigSchema>;

export const DEFAULT_LINT_CONFIG: LintConfig = { rules: {}, budgets: {} };
