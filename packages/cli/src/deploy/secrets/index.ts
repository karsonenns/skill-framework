import type { SecretProvider, SecretResolution } from './types.js';
import { envProvider } from './env.js';
import { fileProvider } from './file.js';
import { sfProvider } from './sf.js';

export type { SecretProvider, SecretResolution } from './types.js';

/** Provider registry — one file per scheme; add op://, doppler://, … here. */
export const PROVIDERS: SecretProvider[] = [envProvider, fileProvider, sfProvider];

export function verifySecret(reference: string, projectRoot: string): SecretResolution {
  const scheme = reference.match(/^([a-z][a-z0-9+.-]*):\/\//)?.[1];
  if (!scheme) {
    return {
      ok: false,
      reason: `\`${reference}\` is not a provider URI. Fix: use env://VAR, file://./path, …`,
    };
  }
  const provider = PROVIDERS.find((p) => p.scheme === scheme);
  if (!provider) {
    return {
      ok: false,
      reason:
        `No secret provider for scheme \`${scheme}://\`. ` +
        `Available: ${PROVIDERS.map((p) => `${p.scheme}://`).join(', ')}.`,
    };
  }
  return provider.verify(reference, projectRoot);
}
