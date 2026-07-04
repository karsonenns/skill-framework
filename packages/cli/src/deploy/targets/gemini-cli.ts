import type { DeployTarget } from './types.js';

/** Gemini CLI reads `.gemini/skills/<name>/SKILL.md` (Agent Skills standard layout). */
export const geminiCli: DeployTarget = {
  name: 'gemini-cli',
  defaultPath: '.gemini/skills',
};
