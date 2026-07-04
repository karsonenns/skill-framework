import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SecretProvider } from './types.js';

/** env://VAR — resolved from process env, falling back to `.env` at project root. */
export const envProvider: SecretProvider = {
  scheme: 'env',
  verify(reference, projectRoot) {
    const varName = reference.replace(/^env:\/\//, '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) {
      return {
        ok: false,
        reason: `\`${reference}\` is not a valid environment variable name. Fix: use env://VAR_NAME.`,
      };
    }
    if (process.env[varName] !== undefined && process.env[varName] !== '') {
      return { ok: true };
    }
    const dotenv = parseDotenv(path.join(projectRoot, '.env'));
    if (dotenv[varName] !== undefined && dotenv[varName] !== '') {
      return { ok: true };
    }
    return {
      ok: false,
      reason:
        `\`${varName}\` is not set in the environment and not present in ${path.join(projectRoot, '.env')}. ` +
        `Fix: export ${varName}=… or add it to .env (which stays gitignored).`,
    };
  },
};

/** Minimal KEY=VALUE parser — no interpolation, `#` comments, optional quotes. */
export function parseDotenv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
