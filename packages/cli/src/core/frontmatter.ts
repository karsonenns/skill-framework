import matter from 'gray-matter';
import type { SkillFrontmatter } from './types.js';

export interface ParsedSkillMd {
  frontmatter: SkillFrontmatter | null;
  frontmatterError?: string;
  hasFrontmatterBlock: boolean;
  body: string;
  /** 1-based line where the body starts (after the closing `---`). */
  bodyStartLine: number;
}

/**
 * Parse a SKILL.md file into frontmatter + body.
 * Never throws: parse failures are reported via `frontmatterError`.
 */
export function parseSkillMd(raw: string): ParsedSkillMd {
  const hasBlock = /^---\r?\n/.test(raw);
  if (!hasBlock) {
    return {
      frontmatter: null,
      hasFrontmatterBlock: false,
      body: raw,
      bodyStartLine: 1,
    };
  }
  try {
    const parsed = matter(raw);
    const data = parsed.data;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return {
        frontmatter: null,
        frontmatterError: 'frontmatter is not a YAML mapping',
        hasFrontmatterBlock: true,
        body: parsed.content,
        bodyStartLine: bodyLine(raw),
      };
    }
    return {
      frontmatter: data as SkillFrontmatter,
      hasFrontmatterBlock: true,
      body: parsed.content,
      bodyStartLine: bodyLine(raw),
    };
  } catch (err) {
    return {
      frontmatter: null,
      frontmatterError: (err as Error).message.split('\n')[0] ?? 'YAML parse error',
      hasFrontmatterBlock: true,
      body: '',
      bodyStartLine: 1,
    };
  }
}

/** Line number (1-based) of the first line after the closing --- delimiter. */
function bodyLine(raw: string): number {
  const lines = raw.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') return i + 2;
  }
  return 1;
}

/** 1-based line number of a frontmatter key inside the raw file, or undefined. */
export function frontmatterKeyLine(raw: string, key: string): number | undefined {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== '---') return undefined;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    if (new RegExp(`^${escapeRegExp(key)}\\s*:`).test(lines[i] ?? '')) return i + 1;
  }
  return undefined;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
