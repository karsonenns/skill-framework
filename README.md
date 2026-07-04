<!-- logo placeholder -->
# Skill Framework

**The framework for organizing, validating, and deploying AI agent skills at scale.**

[![CI](https://github.com/karsonenns/skill-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/karsonenns/skill-framework/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/skillfw)](https://www.npmjs.com/package/skillfw)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## The problem

The [Agent Skills standard](https://agentskills.io) defines a single skill:
one folder, one SKILL.md, done. It deliberately says nothing about what
happens when a company has fifty of them — or five hundred. There is no
convention for how skills compose into an organization's operations: how
they're laid out, named, versioned, budgeted, or shipped to the agents that
run them.

So teams improvise, and the same failures show up everywhere: the same org
context pasted into thirty skills, drifting apart with every edit; skill
trees that quietly eat half the context window because nobody counts tokens;
API keys committed inside instruction files; and no way to know whether the
skills running in a teammate's Claude Code match what's in the repo.

Skill Framework is the missing layer between the spec and the org chart: a
convention for structuring skills, a linter that enforces it in CI, and a
deploy engine that compiles one source tree to every runtime that reads
SKILL.md. Convention over configuration; plan before apply. It works fully
offline and makes no LLM calls.

## 60-second demo

```sh
npx skillfw init --saas && npx skillfw lint && npx skillfw deploy --dry-run
```

```
✓ Scaffolded saas skill tree in /work/acme

✓ 5 skill(s), no problems

Target claude-code (.claude/skills):
  + _shared/references/tone.md
  + customer-escalation/SKILL.md
  + incident-response/scripts/statuspage.sh
  + invoice-dispute/SKILL.md
  + ticket-triage/SKILL.md
  …

Plan: 36 to add, 0 to change, 0 to delete.

Dry run: nothing was written.
```

Already have skills? Point the linter at them — no adoption required:

```sh
npx skillfw lint .claude/skills
```

## The convention

```
<project-root>/
├── skillfw.yaml              # manifest: targets, secrets, token budgets
├── skillfw.lock              # what was deployed where (commit it)
├── skills/
│   ├── domains/              # business capabilities — the NOUNS (billing/, support/, …)
│   ├── orchestrators/        # cross-domain workflows — the VERBS; compose domains by name
│   └── references/           # shared org knowledge — linked, never copy-pasted
└── contracts/                # frontmatter contract + lint severities: your quality gate
```

One sentence each: **domains** hold skills that own exactly one capability;
**orchestrators** wire domain skills into workflows without duplicating
their instructions; **references** is org knowledge written once and linked
everywhere; **contracts** is where your team's rules become CI-enforceable.
Full spec: [docs/convention.md](docs/convention.md).

## Lint — the quality gate

16 rules, each with an id, a rationale, and a fix hint
([all documented](docs/lint-rules.md)) — including the Agent Skills spec
constraints themselves (name/description/compatibility limits, field types),
so a clean `sf lint` means spec-valid skills. The ones that catch real fires:

| Rule | Catches |
|---|---|
| SF004/SF005 | name/folder mismatches and duplicate skill names |
| SF007 | descriptions agents can't route on ("Billing stuff.") |
| SF008 | dead links to references, scripts, and other skills |
| SF009/SF010 | skills and trees blowing their token budgets |
| SF011 | hardcoded credentials — AWS keys, `sk_live_…`, PEM blocks |
| SF012 | skills using secrets the manifest never declared |

`--format json` for pipelines, `--format github` for PR annotations,
`--fix` for safe autofixes. Exit 1 on any error.

## Deploy — one tree, every runtime

`sf deploy` lints, verifies secrets resolve, then compiles the tree into
each target's layout — flattened, links rewritten, sf-only metadata tucked
into a comment so the output stays 100% spec-compliant. `--dry-run` shows a
Terraform-style plan first. Deploy owns its output directories: it removes
what it wrote when source skills disappear, and never touches files it
didn't write. Details: [docs/deploy-targets.md](docs/deploy-targets.md).

## Secrets — declared, never embedded

Skills declare needs (`secrets: [STRIPE_KEY]`); `skillfw.yaml` maps keys to
providers (`env://`, `file://`); deploy verifies every key resolves and
fails loudly if not. Values are never written into compiled trees. Lint
catches both hardcoded credentials and undeclared needs.
Details: [docs/secrets.md](docs/secrets.md).

## Drift detection

`sf diff` answers "is what's running what's in the repo?" — comparing the
source tree, the lockfile, and each target directory. Stale deploys, direct
edits to compiled output, deleted files, never-deployed skills: all
reported, exit 1 on drift, CI-ready.

## Works with

**Claude Code** · **Codex CLI** · **Gemini CLI** · **Cursor** — and anything
else that reads SKILL.md. Skill Framework is vendor-neutral by design: the
compiled output is plain Agent Skills format, and no feature depends on one
vendor's extensions.

## Skill Framework vs. the alternatives

| | Raw skills folder | Marketplaces | Skill Framework |
|---|---|---|---|
| Layout convention for many skills | ✗ | ✗ | ✓ |
| CI-enforceable quality gates | ✗ | ✗ | ✓ 16 lint rules |
| Token budgets | ✗ | ✗ | ✓ per-skill + per-tree |
| Secrets governance | ✗ | ✗ | ✓ declared, verified, never embedded |
| Multi-runtime deploy | copy-paste | per-runtime install | ✓ one tree → four runtimes |
| Drift detection | ✗ | ✗ | ✓ `sf diff` |
| Distribution of third-party skills | ✗ | ✓ | ✗ (by design) |

Marketplaces distribute skills; Skill Framework organizes and governs the
ones your org actually runs. They compose — skills you install from
anywhere can live in your tree.

## Roadmap

- **v1 (now):** everything above — convention, 16 lint rules, four deploy
  targets, `env://`/`file://` secrets, lockfile + drift detection, GitHub
  Action.
- **v1.x:** more secret providers (`op://`, `doppler://`), more deploy
  targets, `sf test` for exercising skills against fixtures.
- **Future:** team sync and a cloud backend are plausible directions if the
  framework earns them; nothing is promised.

## Contributing

PRs welcome — new lint rules, deploy targets, and secret providers are each
a single file plus a test. See [CONTRIBUTING.md](CONTRIBUTING.md). The
convention itself lives in [docs/convention.md](docs/convention.md) and is
open to RFCs.

## License

[MIT](LICENSE)
