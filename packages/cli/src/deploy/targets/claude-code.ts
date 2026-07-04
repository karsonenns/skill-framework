import type { DeployTarget } from './types.js';

/**
 * Claude Code reads `.claude/skills/<name>/SKILL.md`.
 * `allowed-tools` passes through — Claude Code understands it natively.
 */
export const claudeCode: DeployTarget = {
  name: 'claude-code',
  defaultPath: '.claude/skills',
};
