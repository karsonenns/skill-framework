import type { DeployTarget } from './types.js';

/** Cursor reads `.cursor/skills/<name>/SKILL.md` (Agent Skills standard layout). */
export const cursor: DeployTarget = {
  name: 'cursor',
  defaultPath: '.cursor/skills',
};
