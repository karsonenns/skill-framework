import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'node:test';

export type TreeFiles = Record<string, string | { content: string; mode?: number }>;

const tmps: string[] = [];
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

/** Temp dir with the given files; keys ending in "/" create empty dirs. */
export function makeTree(files: TreeFiles): string {
  const root = mkdtempSync(path.join(tmpdir(), 'skillfw-'));
  tmps.push(root);
  for (const [relPath, spec] of Object.entries(files)) {
    const abs = path.join(root, relPath);
    if (relPath.endsWith('/')) { mkdirSync(abs, { recursive: true }); continue; }
    mkdirSync(path.dirname(abs), { recursive: true });
    const { content, mode } = typeof spec === 'string' ? { content: spec, mode: undefined } : spec;
    writeFileSync(abs, content);
    if (mode !== undefined) chmodSync(abs, mode);
  }
  return root;
}

export const MANIFEST = `version: 1
name: test-org
targets:
  claude-code:
    path: .claude/skills
secrets:
  API_TOKEN: env://SFW_TEST_TOKEN
`;

export const CONTRACT = `required: [name, description, version, memory, duration]
patterns:
  memory: "^(knowledge|perception|procedure|motor|judgment)$"
  duration: "^(session-only|temporary|reinforced|permanent)$"
`;

export function skillMd(name: string, over: Record<string, string> = {}, body = 'Do the thing.'): string {
  const fm: Record<string, string> = {
    name,
    description: `Handle ${name} work. Use when asked about ${name}.`,
    version: '0.1.0',
    memory: 'procedure',
    duration: 'permanent',
    ...over,
  };
  const lines = Object.entries(fm).filter(([, v]) => v !== '').map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n\n# ${name}\n\n${body}\n`;
}

/** Minimal valid project: manifest + contract + one deep domain skill. */
export function project(extra: TreeFiles = {}): TreeFiles {
  return {
    'skillfw.yaml': MANIFEST,
    'contracts/frontmatter.yaml': CONTRACT,
    'skills/domain/transportation/aviation/rotary-wing/b-212/SKILL.md': skillMd('b-212'),
    ...extra,
  };
}
