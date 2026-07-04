import type { DeployTarget } from './types.js';

/** Codex CLI reads `.codex/skills/<name>/SKILL.md` (Agent Skills standard layout). */
export const codex: DeployTarget = {
  name: 'codex',
  defaultPath: '.codex/skills',
};
