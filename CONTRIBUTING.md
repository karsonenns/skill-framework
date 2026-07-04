# Contributing

Thanks for helping build Skill Framework.

## Setup

```sh
git clone https://github.com/karsonenns/skill-framework
cd skill-framework
npm install
npm run build      # syncs archetypes + compiles the CLI
npm test           # vitest
npm run typecheck
```

Run the development CLI with `node packages/cli/bin/sf.js …` after a build.

## Layout

- `packages/cli/` — the `sf` CLI (npm package `skillfw`)
  - `src/core/` — tree loader, manifest, lockfile, frontmatter
  - `src/lint/rules/` — **one file per rule**
  - `src/deploy/targets/` — **one file per runtime**
  - `src/deploy/secrets/` — **one file per provider scheme**
- `archetypes/` — canonical templates for `sf init` (the copy under
  `packages/cli/archetypes/` is generated; never edit it)
- `examples/acme-saas/` — the complete example tree; must stay lint-clean
- `docs/` — the convention spec and reference docs

## Adding things

**A lint rule:** create `src/lint/rules/sfNNN-slug.ts` implementing `Rule`,
register it in `rules/index.ts`, document it in `docs/lint-rules.md`, and add
fixture-based tests (bad tree in → expected findings out) in
`test/lint.test.ts`. Every rule message must say what's wrong, where, and how
to fix it.

**A deploy target:** create `src/deploy/targets/<name>.ts`, register it in
`targets/index.ts`, document it in `docs/deploy-targets.md`, add a test.

**A secret provider:** create `src/deploy/secrets/<scheme>.ts`, register it
in `secrets/index.ts`, document it in `docs/secrets.md`, add a test.

**A convention change:** open an issue as an RFC first — the convention in
`docs/convention.md` is an interface other people's CI depends on.

## Quality bar

- TypeScript strict; Node ≥ 20; ESM only.
- Every behavior change ships with tests. Lint rules use fixtures; deploy
  uses temp dirs and snapshots. Target ≥ 80% coverage on `core/`, `lint/`,
  `deploy/`.
- No new runtime dependencies without discussion — the CLI stays small and
  fully offline. No telemetry.
- [Conventional commits](https://www.conventionalcommits.org)
  (`feat:`, `fix:`, `docs:`, …).

## Releases

Maintainers: update `CHANGELOG.md`, run `npm version <bump>` in
`packages/cli/`, push the tag — the publish workflow does the rest.
