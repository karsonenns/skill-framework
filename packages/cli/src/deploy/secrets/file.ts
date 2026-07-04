import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { SecretProvider } from './types.js';

/** file://path — a local file; permissions must be 0600 or tighter. */
export const fileProvider: SecretProvider = {
  scheme: 'file',
  verify(reference, projectRoot) {
    const rawPath = reference.replace(/^file:\/\//, '');
    const abs = path.isAbsolute(rawPath) ? rawPath : path.resolve(projectRoot, rawPath);
    if (!existsSync(abs)) {
      return {
        ok: false,
        reason: `Secret file not found: ${abs}. Fix: create the file, or correct the path in skillfw.yaml.`,
      };
    }
    const stat = statSync(abs);
    if (!stat.isFile()) {
      return { ok: false, reason: `Secret path is not a file: ${abs}.` };
    }
    if (process.platform !== 'win32') {
      const perms = stat.mode & 0o777;
      if ((perms & 0o077) !== 0) {
        return {
          ok: false,
          reason:
            `Secret file ${abs} has permissions ${perms.toString(8).padStart(3, '0')}; ` +
            `must be 0600 or tighter. Fix: chmod 600 ${abs}`,
        };
      }
    }
    return { ok: true };
  },
};
