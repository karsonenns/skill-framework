# Contributing

```sh
npm install && npm test      # builds, syncs archetypes, runs vitest
node packages/cli/bin/sf.js  # run the dev CLI (after a build)
```

Layout: the CLI lives in `packages/cli/src` — `lint.ts` (all rules in the
`RULES` array), `deploy.ts` (`TARGETS` table + compile/plan/diff),
`secrets.ts` (one case per scheme), `tree.ts`, `config.ts`, `core.ts`,
`index.ts`. The canonical archetype is `archetypes/starter/` (the copy under
`packages/cli/archetypes/` is generated — never edit it).

To add a lint rule, deploy target, or secret provider: one entry in the
respective table, a test, and a row in the table in
[docs/convention.md](docs/convention.md). Rule messages must say what's
wrong, where, and how to fix it.

Ground rules: TypeScript strict, Node ≥ 20, ESM; every behavior change ships
with a test; the starter archetype stays lint-clean; no new runtime
dependencies (there is exactly one: `yaml`) and no telemetry. Convention
changes start as an RFC issue — the convention is an interface other
people's CI depends on. Use
[conventional commits](https://www.conventionalcommits.org).

Release (maintainers): update CHANGELOG.md, `npm version` in packages/cli,
push the tag — the publish workflow does the rest.
