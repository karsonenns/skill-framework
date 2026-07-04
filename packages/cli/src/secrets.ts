import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export interface SecretResolution { ok: boolean; reason?: string }

/**
 * Verify a secret reference resolves. sf never reads secret values into
 * compiled output — deploy checks resolvability only. Providers: one case
 * per scheme; add op://, doppler://, … here.
 */
export function verifySecret(reference: string, projectRoot: string): SecretResolution {
  const scheme = reference.match(/^([a-z][a-z0-9+.-]*):\/\//)?.[1];
  const rest = reference.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  switch (scheme) {
    case 'env': {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(rest)) {
        return { ok: false, reason: `\`${reference}\` is not a valid env var name. Fix: use env://VAR_NAME.` };
      }
      if (process.env[rest]) return { ok: true };
      if (parseDotenv(path.join(projectRoot, '.env'))[rest]) return { ok: true };
      return {
        ok: false,
        reason:
          `\`${rest}\` is not set in the environment and not in ${path.join(projectRoot, '.env')}. ` +
          `Fix: export ${rest}=… or add it to .env (which stays gitignored).`,
      };
    }
    case 'file': {
      const abs = path.isAbsolute(rest) ? rest : path.resolve(projectRoot, rest);
      if (!existsSync(abs)) {
        return { ok: false, reason: `Secret file not found: ${abs}. Fix: create it or correct the path in skillfw.yaml.` };
      }
      const stat = statSync(abs);
      if (!stat.isFile()) return { ok: false, reason: `Secret path is not a file: ${abs}.` };
      if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
        return {
          ok: false,
          reason: `Secret file ${abs} has permissions ${(stat.mode & 0o777).toString(8)}; must be 0600 or tighter. Fix: chmod 600 ${abs}`,
        };
      }
      return { ok: true };
    }
    case 'sf':
      return { ok: false, reason: 'sf:// requires Skill Framework Cloud (not yet available). Fix: use env:// or file://.' };
    case undefined:
      return { ok: false, reason: `\`${reference}\` is not a provider URI. Fix: use env://VAR or file://./path.` };
    default:
      return { ok: false, reason: `No secret provider for scheme \`${scheme}://\`. Available: env://, file://.` };
  }
}

/** Minimal KEY=VALUE parser — `#` comments, optional quotes, no interpolation. */
export function parseDotenv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}
