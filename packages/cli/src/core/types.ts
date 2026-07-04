/** Shared types for the loaded skill tree. */

export type SkillKind = 'domain' | 'orchestrator' | 'flat';

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  domain?: string;
  apis?: string[];
  secrets?: string[];
  uses?: string[];
  'allowed-tools'?: string | string[];
  [key: string]: unknown;
}

export interface SkillEntry {
  /** Absolute path to the skill directory. */
  dir: string;
  /** Path of the skill directory relative to the tree root, POSIX separators. */
  relDir: string;
  /** Folder name of the skill. */
  folderName: string;
  kind: SkillKind;
  /** Domain folder name, for domain skills in a structured tree. */
  domain?: string;
  /** Absolute path to SKILL.md if present. */
  skillMdPath?: string;
  /** Misnamed SKILL.md variants found (e.g. skill.md, SKILLS.md). */
  misnamed: string[];
  /** Raw file content of SKILL.md. */
  raw?: string;
  /** Parsed frontmatter, or null if missing/unparseable. */
  frontmatter: SkillFrontmatter | null;
  /** Parse error message when frontmatter could not be read. */
  frontmatterError?: string;
  /** Whether a frontmatter block was present at all. */
  hasFrontmatterBlock: boolean;
  /** Markdown body (content after frontmatter). */
  body: string;
  /** 1-based line number where the body starts in SKILL.md. */
  bodyStartLine: number;
}

export interface SkillTree {
  /** Absolute path to the tree root (directory that was loaded). */
  root: string;
  /** True when the tree follows the skillfw convention (skills/domains, skills/orchestrators). */
  structured: boolean;
  /** Absolute path to the skills directory (== root in generic mode). */
  skillsDir: string;
  skills: SkillEntry[];
  /** Absolute paths of shared reference files (skills/references/**), structured mode only. */
  sharedReferences: string[];
  /** Directories that look like they should hold a skill but have no SKILL.md. */
  emptySkillDirs: string[];
}
