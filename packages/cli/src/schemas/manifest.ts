import { z } from 'zod';

export const SECRET_SCHEMES = ['env', 'file', 'sf'] as const;

const secretUri = z
  .string()
  .refine((v) => /^[a-z][a-z0-9+.-]*:\/\//.test(v), {
    message: 'secret value must be a provider URI like env://VAR or file://./path',
  });

const targetSchema = z.object({
  path: z.string().min(1),
});

export const manifestSchema = z
  .object({
    version: z.literal(1),
    name: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'name must be lowercase-hyphenated'),
    skills_dir: z.string().min(1).default('skills'),
    targets: z.record(z.string(), targetSchema).default({}),
    secrets: z.record(z.string(), secretUri).default({}),
    budgets: z
      .object({
        skill_tokens: z.number().int().positive().default(2000),
        tree_tokens: z.number().int().positive().default(60000),
      })
      .default({ skill_tokens: 2000, tree_tokens: 60000 }),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;

export const KNOWN_TARGETS = ['claude-code', 'codex', 'gemini-cli', 'cursor'] as const;
export type KnownTarget = (typeof KNOWN_TARGETS)[number];
