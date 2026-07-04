# Deploy targets

`sf deploy` compiles the source tree into each runtime's expected layout.
Targets are configured in `skillfw.yaml`:

```yaml
targets:
  claude-code:
    path: .claude/skills
  codex:
    path: .codex/skills
  gemini-cli:
    path: .gemini/skills
  cursor:
    path: .cursor/skills
```

`sf deploy` compiles all configured targets; `--target claude-code` limits
the run; `--dry-run` prints the create/update/delete plan Terraform-style
and writes nothing.

## What compilation does

For every target, identically in v1 (core SKILL.md is portable by design):

1. **Flatten.** `skills/domains/*/<skill>/` and `skills/orchestrators/<skill>/`
   both become `<path>/<skill-name>/`, carrying `references/` and `scripts/`
   (execute bits preserved).
2. **Strip sf metadata.** `domain`, `apis`, `secrets`, and `uses` are moved
   out of frontmatter into an HTML comment below it, so nothing non-standard
   leaks into the compiled frontmatter. `allowed-tools` passes through.

   ```markdown
   ---
   name: invoice-dispute
   description: …
   version: 1.2.0
   ---

   <!-- skillfw
   domain: billing
   secrets:
     - STRIPE_KEY
   -->
   ```

3. **Copy shared references.** `skills/references/` becomes
   `<path>/_shared/references/`. Runtimes ignore the `_shared` directory
   because it has no SKILL.md.
4. **Rewrite links.** Relative links are rewritten so they still resolve
   after flattening: links into shared references point at `_shared/`,
   cross-skill links point at the flattened sibling folder.
5. **Track everything in `skillfw.lock`.** Deploy is idempotent and owns its
   output: it deletes files it previously wrote that no longer exist in
   source, and never touches files it did not write.

## Drift detection

`sf diff` compares three states — the source tree, the lockfile, and what is
actually on disk in each target — and reports:

| Finding | Meaning |
|---|---|
| `stale` | source changed since last deploy |
| `modified in target` | someone edited compiled output directly |
| `missing in target` | compiled files were deleted |
| `not deployed` | skill exists in source, never deployed |
| `removed from source` | lockfile has a skill the source no longer does |

Exit code is 1 when drift exists, so `sf diff` works as a CI gate.

## Adding a target

One file per runtime under `packages/cli/src/deploy/targets/`. A target is a
name, a default path, and an optional per-file transform hook:

```ts
export const myRuntime: DeployTarget = {
  name: 'my-runtime',
  defaultPath: '.my-runtime/skills',
  // transformFile(file) { … }   // only if the runtime needs quirks
};
```

Register it in `targets/index.ts`, add a test, done.
