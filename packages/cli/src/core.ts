import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** A user-facing error: says what's wrong, where, and how to fix it. */
export class UserError extends Error {}

// Official semver regex from semver.org, anchored.
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
export const isValidSemver = (v: string): boolean => SEMVER_RE.test(v);

export const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Token estimate: ~4 chars per token. No LLM, no tokenizer. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const tty = process.stdout.isTTY === true;
const paint = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const red = paint(31);
export const green = paint(32);
export const yellow = paint(33);
export const magenta = paint(35);
export const bold = paint(1);
export const dim = paint(2);

/** Root of the installed skillfw package (contains package.json). */
export function packageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('skillfw package root not found');
    dir = parent;
  }
  return dir;
}

export function packageVersion(): string {
  return (JSON.parse(readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as {
    version: string;
  }).version;
}

const IGNORED = new Set(['node_modules', '.git', 'dist', 'coverage']);

export function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !IGNORED.has(d.name) && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
}

export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .sort();
}

export function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const sub of listDirs(dir)) out.push(...listFilesRecursive(path.join(dir, sub)));
  for (const f of listFiles(dir)) out.push(path.join(dir, f));
  return out.sort();
}

export const toPosix = (p: string): string => p.split(path.sep).join('/');

/** Read as UTF-8, or null when the file looks binary. */
export function readTextFile(absPath: string): string | null {
  const buf = readFileSync(absPath);
  return buf.includes(0) ? null : buf.toString('utf8');
}

/** 1-based line number of character `index` in `text`. */
export function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}
