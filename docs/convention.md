# The Skill Framework convention

This is the layout spec that `sf init` scaffolds and `sf lint` enforces. It is
open to RFCs — propose changes via GitHub issues.

The [Agent Skills standard](https://agentskills.io) defines a *single* skill
folder: a `SKILL.md` with YAML frontmatter, plus optional resources. It says
nothing about how 50–500 skills compose into an organization. This convention
is that layer.

## Layout

```
<project-root>/
├── skillfw.yaml              # manifest — targets, secrets, budgets
├── skillfw.lock              # written by `sf deploy`; COMMIT it
├── skills/
│   ├── domains/              # business capabilities — the NOUNS
│   │   └── <domain>/         #   e.g. billing/, support/, legal/
│   │       └── <skill>/      #   e.g. invoice-dispute/
│   │           ├── SKILL.md  #   required; Agent Skills spec compliant
│   │           ├── references/   # optional; loaded on demand
│   │           └── scripts/      # optional; executable helpers
│   ├── orchestrators/        # cross-domain workflows — the VERBS
│   │   └── <workflow>/       #   e.g. month-end-close/
│   │       └── SKILL.md      #   composes domain skills by name
│   └── references/           # shared org knowledge (brand, tone, policies)
│       └── *.md
└── contracts/
    ├── frontmatter.yaml      # required/allowed frontmatter fields + regexes
    └── lint.yaml             # rule config: severities, budgets
```

## Rules

1. **Naming.** Skill folder names are lowercase-hyphenated and must equal the
   frontmatter `name` (SF004). Names are unique across the whole tree (SF005)
   because deploy flattens every skill into one namespace.

2. **Frontmatter.** Every SKILL.md carries YAML frontmatter with at minimum
   `name`, `description`, and `version` (valid semver — SF003, SF006).
   Optional fields:
   - `domain` — the owning domain (informational; stripped on deploy)
   - `apis` — first/third-party APIs the skill touches
   - `secrets` — secret keys the skill needs (must be declared in the
     manifest — SF012)
   - `uses` — for orchestrators: the domain skills they compose (SF013)
   - `allowed-tools` — passed through to runtimes that support it

3. **Domain skills own one capability.** If a skill description needs the
   word "and" twice, it is probably two skills.

4. **Orchestrators compose, never duplicate.** An orchestrator lists the
   domain skills it drives in `uses:` and references them by name in its
   body. Procedure detail lives in the domain skill, once.

5. **Shared knowledge lives in `skills/references/`.** Skills link to it with
   relative paths (`../../../references/tone.md`). Lint verifies every link
   resolves (SF008); deploy rewrites links so they still resolve after
   flattening. No copy-pasting org context into individual skills.

6. **Budgets are part of the contract.** `budgets.skill_tokens` caps each
   SKILL.md body; `budgets.tree_tokens` caps the sum of all descriptions
   (descriptions are the part every agent always loads). Estimates are
   chars/4 — no LLM calls.

## Manifest (`skillfw.yaml`)

```yaml
version: 1                      # manifest schema version
name: acme-ops                  # tree name, lowercase-hyphenated
skills_dir: skills              # default "skills"

targets:                        # where `sf deploy` compiles to
  claude-code:
    path: .claude/skills        # relative to project root
  codex:
    path: .codex/skills
  gemini-cli:
    path: .gemini/skills
  cursor:
    path: .cursor/skills

secrets:                        # referenced by skills via frontmatter `secrets:`
  STRIPE_KEY: env://STRIPE_KEY          # process env / .env file
  PARTNER_API: file://./secrets/pa.txt  # local file (0600 enforced)
  # sf:// is reserved for Skill Framework Cloud and errors for now

budgets:
  skill_tokens: 2000            # max tokens per SKILL.md body (default)
  tree_tokens: 60000            # max total across all descriptions (default)
```

`sf validate` checks the manifest alone; `sf lint` includes it.

## Lockfile (`skillfw.lock`)

Written on every deploy, and **committed** — it is the record of what was
compiled where, used by `sf diff` for drift detection and by deploy to
delete files it previously wrote that no longer exist in source.

```yaml
version: 1
deployed_at: 2026-07-04T20:15:00.000Z
targets:
  claude-code:
    path: .claude/skills
    skills:
      invoice-dispute:
        version: 1.2.0
        hash: sha256-…          # content hash of the compiled skill folder
        files: [invoice-dispute/SKILL.md, …]
    shared_files: [_shared/references/tone.md, …]
```

## Contracts

`contracts/frontmatter.yaml` sets required fields, the allowed-field list
(enforced by SF015 when enabled), and per-field regex patterns:

```yaml
required: [name, description, version]
allowed: [name, description, version, domain, apis, secrets, uses, allowed-tools]
patterns:
  name: "^[a-z0-9]+(-[a-z0-9]+)*$"
```

`contracts/lint.yaml` tunes rule severities and budgets:

```yaml
rules:
  SF007: error    # make description quality blocking
  SF015: warn     # flag unknown frontmatter fields
budgets:
  skill_tokens: 1500
```
