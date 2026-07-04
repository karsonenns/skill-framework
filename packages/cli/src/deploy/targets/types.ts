import type { CompiledSkillFile } from '../compile.js';

export interface DeployTarget {
  /** Target name as used in skillfw.yaml `targets:` and `--target`. */
  name: string;
  /** Default output path, relative to project root. */
  defaultPath: string;
  /**
   * Optional per-target transform applied to each compiled file.
   * v1 targets keep this a no-op — core SKILL.md is portable by design.
   * Contributors adding a runtime with quirks implement it here.
   */
  transformFile?(file: CompiledSkillFile): CompiledSkillFile;
}
