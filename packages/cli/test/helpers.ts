import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface FileSpec {
  content: string;
  mode?: number;
}

export type TreeFiles = Record<string, string | FileSpec>;

export function makeTmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'skillfw-test-'));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Write a tree of files; keys are POSIX-relative paths. Empty-string dirs end with '/'. */
export function writeTree(root: string, files: TreeFiles): void {
  for (const [rel, spec] of Object.entries(files)) {
    const abs = path.join(root, rel);
    if (rel.endsWith('/')) {
      mkdirSync(abs, { recursive: true });
      continue;
    }
    mkdirSync(path.dirname(abs), { recursive: true });
    const { content, mode } = typeof spec === 'string' ? { content: spec, mode: undefined } : spec;
    writeFileSync(abs, content, 'utf8');
    if (mode !== undefined) chmodSync(abs, mode);
  }
}

export const BASE_MANIFEST = `version: 1
name: test-org
skills_dir: skills
targets:
  claude-code:
    path: .claude/skills
secrets: {}
budgets:
  skill_tokens: 2000
  tree_tokens: 60000
`;

export function skillMd(
  name: string,
  extra: { description?: string; version?: string; fmExtra?: string; body?: string } = {},
): string {
  const description =
    extra.description ??
    `Handle ${name} work end to end. Use when asked to work on ${name} tasks.`;
  const version = extra.version ?? '0.1.0';
  return `---
name: ${name}
description: ${description}
version: ${version}
${extra.fmExtra ?? ''}---

# ${name}

${extra.body ?? 'Do the thing carefully.'}
`;
}

/** A minimal valid structured project: manifest + one billing skill. */
export function baseProject(files: TreeFiles = {}): TreeFiles {
  return {
    'skillfw.yaml': BASE_MANIFEST,
    'skills/domains/billing/refund-request/SKILL.md': skillMd('refund-request'),
    ...files,
  };
}
