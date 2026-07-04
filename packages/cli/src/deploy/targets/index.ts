import type { DeployTarget } from './types.js';
import { claudeCode } from './claude-code.js';
import { codex } from './codex.js';
import { geminiCli } from './gemini-cli.js';
import { cursor } from './cursor.js';

export type { DeployTarget } from './types.js';

/** Registry — one file per runtime under deploy/targets/. */
export const TARGETS: DeployTarget[] = [claudeCode, codex, geminiCli, cursor];

export function getTarget(name: string): DeployTarget | undefined {
  return TARGETS.find((t) => t.name === name);
}
