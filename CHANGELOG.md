# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com); versions follow
[semver](https://semver.org).

## [Unreleased]

## [0.1.0] - 2026-07-04

Initial release.

### Added
- The skill tree convention: `domains/` (nouns), `orchestrators/` (verbs),
  shared `references/`, and `contracts/` (docs/convention.md).
- `sf init` with `--saas` and `--solo` archetypes; both pass lint clean.
- `sf new domain|skill|orchestrator` templates that pass lint immediately.
- `sf lint` with rules SF001–SF015, configurable severities and budgets,
  `--format pretty|json|github`, and `--fix` for safe fixes.
- `sf validate` for manifest-only checks.
- `sf deploy` compiling to claude-code, codex, gemini-cli, and cursor, with
  Terraform-style `--dry-run` plans, link rewriting, lockfile tracking, and
  idempotent owned-output semantics.
- `sf diff` drift detection: stale, modified-in-target, missing-in-target,
  not-deployed, removed-from-source.
- Secrets model: `env://` and `file://` providers (verify-only), `sf://`
  reserved, SF011/SF012 enforcement.
- Reusable GitHub Action wrapping `sf lint` with PR annotations.
