import path from 'node:path';
import { readFileSync } from 'node:fs';
import { toPosix } from '../core/tree.js';
import type { SkillTree } from '../core/types.js';

export function relFile(tree: SkillTree, absPath: string): string {
  return toPosix(path.relative(tree.root, absPath));
}

/** Read a file as UTF-8, returning null when it looks binary. */
export function readTextFile(absPath: string): string | null {
  const buf = readFileSync(absPath);
  if (buf.includes(0)) return null;
  return buf.toString('utf8');
}

/** 1-based line number of the first match of `re` in `text`, or undefined. */
export function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}
