# Secrets model

Skills never contain secrets. They declare needs; the manifest maps needs to
providers; deploy verifies everything resolves. Three pieces:

**1. The skill declares intent** in frontmatter:

```yaml
secrets:
  - STRIPE_KEY
```

**2. The manifest maps the key to a provider** via URI scheme:

```yaml
secrets:
  STRIPE_KEY: env://STRIPE_KEY          # process env, or .env at project root
  PARTNER_API: file://./secrets/pa.txt  # local file; 0600 perms enforced
```

**3. Deploy verifies resolvability** — and only that. `sf deploy` confirms
every declared secret resolves and fails loudly if not. Secret *values* are
never written into compiled skill trees. Where a runtime needs the value at
agent runtime, the skill's instructions reference the env var by name; sf's
job is validation plus the audit trail of which skill needs what.

## Providers

| Scheme | Resolution | Notes |
|---|---|---|
| `env://VAR` | process env, falling back to `.env` at project root | `.env` is gitignored by `sf init` |
| `file://path` | local file, relative to project root | deploy errors if permissions are wider than `0600` |
| `sf://…` | — | reserved for Skill Framework Cloud; parses, then errors with a friendly message |

## Enforcement chain

- **SF011 (error):** credential-looking strings in any skill file — AWS keys,
  `sk_live_…`, PEM headers, bearer tokens, `password=` literals.
- **SF012 (error):** a skill declares a secret the manifest doesn't map.
- **Deploy gate:** a mapped secret that doesn't resolve aborts the deploy
  (`--dry-run` reports it as a warning instead, so you can always see the plan).

## Adding a provider

One file per scheme under `packages/cli/src/deploy/secrets/`:

```ts
export const opProvider: SecretProvider = {
  scheme: 'op',
  verify(reference, projectRoot) {
    // return { ok: true } or { ok: false, reason: 'what and how to fix' }
  },
};
```

Register it in `secrets/index.ts`. `op://`, `doppler://`, `vault://` are
natural v1.x candidates — PRs welcome.
