import type { SecretProvider } from './types.js';

/** sf:// — reserved for Skill Framework Cloud. Parses, but always errors. */
export const sfProvider: SecretProvider = {
  scheme: 'sf',
  verify() {
    return {
      ok: false,
      reason:
        'sf:// requires Skill Framework Cloud (not yet available). ' +
        'Fix: use env:// or file:// for now.',
    };
  },
};
