# Changelog

Format: [Keep a Changelog](https://keepachangelog.com); versions follow semver.

## [0.2.0] - 2026-07-04

Breaking restructure of the convention, and a ~75% cut of the codebase with
no loss of functionality (runtime dependencies reduced to `yaml` alone).

- Skills are now classified on four axes: a **domain** taxonomy of arbitrary
  depth (`skills/domain/transportation/aviation/rotary-wing/b-212/`),
  **outcomes** (`skills/outcome/extract-team-from-rooftop/`, replacing
  orchestrators), and two lint-enforced frontmatter vocabularies —
  `memory` (knowledge/perception/procedure/motor/judgment) and `duration`
  (session-only/temporary/reinforced/permanent).
- New SF017: contract-pattern validation (enforces the vocabularies).
- `sf init` scaffolds a single starter archetype (replaces --saas/--solo);
  `sf new skill <domain-path>/<name>` creates taxonomy dirs implicitly
  (replaces `sf new domain` + `sf new orchestrator` → `sf new outcome`).

## [0.1.0] - 2026-07-04

Initial release: the convention, `sf init/new/lint/validate/deploy/diff`,
rules SF001–SF016 (including Agent Skills spec limits), four deploy targets
with spec-pure output and lockfile drift detection, verify-only `env://` and
`file://` secret providers, and a reusable GitHub Action for `sf lint`.
