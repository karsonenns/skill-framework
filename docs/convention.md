# The Skill Framework convention

The [Agent Skills spec](https://agentskills.io/specification) defines one
skill folder. This convention defines how hundreds compose into an
organization. It is enforced by `sf lint` and open to RFCs via issues.

## Layout

```
<project-root>/
├── skillfw.yaml            # manifest: targets, secrets, budgets
├── skillfw.lock            # written by `sf deploy`; commit it
├── skills/
│   ├── domain/             # capability taxonomy, any depth — the NOUNS
│   │   └── transportation/aviation/rotary-wing/b-212/
│   │       ├── SKILL.md    #   a dir containing SKILL.md is a skill;
│   │       ├── references/ #   dirs above it are taxonomy
│   │       └── scripts/    #   (assets/ and any other files also carried)
│   ├── outcome/            # end states the org must achieve — the VERBS
│   │   └── extract-team-from-rooftop/SKILL.md
│   └── references/         # shared org knowledge, linked never copied
└── contracts/
    ├── frontmatter.yaml    # required fields, allowed fields, patterns
    └── lint.yaml           # rule severities, budget overrides
```

**Domain skills** own one capability each; the taxonomy above them is pure
organization. **Outcomes** compose domain skills by name in `uses:` and never
duplicate their instructions — an outcome is achieved or aborted, not
partially done.

## Frontmatter

Spec fields first (validated by SF004/SF016): `name` (≤64 chars,
lowercase-hyphenated, equals the folder name), `description` (≤1024 chars),
optional `license`, `compatibility`, `metadata`, `allowed-tools`
(space-separated string).

sf projects add four classification fields, required by the scaffolded
contract and compiled away on deploy:

| Field | Values | Meaning |
|---|---|---|
| `version` | semver | drives `sf diff` staleness |
| `memory` | `knowledge` `perception` `procedure` `motor` `judgment` | what kind of competence this encodes |
| `duration` | `session-only` `temporary` `reinforced` `permanent` | how long it should persist for the agent |
| `uses` | skill names | outcomes only: the domain skills composed |

Plus governance hooks: `apis` (what it touches) and `secrets` (what it
needs — every key must be mapped in the manifest, SF012).

## Manifest

```yaml
version: 1
name: my-org
skills_dir: skills            # default
targets:                      # where `sf deploy` compiles to
  claude-code: { path: .claude/skills }
  codex:       { path: .codex/skills }
  gemini-cli:  { path: .gemini/skills }
  cursor:      { path: .cursor/skills }
secrets:
  STRIPE_KEY: env://STRIPE_KEY          # process env or .env
  PARTNER_API: file://./secrets/pa.txt  # local file, 0600 enforced
  # sf:// is reserved for a future cloud and errors today
budgets:
  skill_tokens: 2000          # per SKILL.md body (chars/4 estimate)
  tree_tokens: 60000          # sum of all descriptions — the always-loaded tax
```

## Lint rules

Exit 1 on any error. Severities configurable per rule in `contracts/lint.yaml`
(`error | warn | off`). `--format json|github` for CI; `--fix` applies safe
fixes only (chmod +x, name casing). Works on any directory of skills — on a
bare tree, only the spec's own requirements apply (no false errors).

| ID | Default | Catches |
|---|---|---|
| SF001 | error | SKILL.md missing, or misnamed (`skill.md`) — detected case-sensitively even on macOS |
| SF002 | error | frontmatter missing or unparseable |
| SF003 | error | required field missing (per contract) |
| SF004 | error | name/folder mismatch, bad casing, >64 chars |
| SF005 | error | duplicate skill names (deploy flattens to one namespace) |
| SF006 | error | version not valid semver |
| SF007 | warn | description too short or lacking trigger language (heuristic, no LLM) |
| SF008 | error | dead relative link in any skill .md |
| SF009 | warn | skill body over `budgets.skill_tokens` |
| SF010 | warn | descriptions total over `budgets.tree_tokens` |
| SF011 | error | hardcoded credential (AWS keys, `sk_live_…`, PEM, tokens, `password=`) |
| SF012 | error | frontmatter secret not declared in the manifest |
| SF013 | warn | outcome `uses:` a skill that doesn't exist |
| SF014 | warn | script in scripts/ not executable |
| SF015 | off | frontmatter field not in the contract's `allowed` list |
| SF016 | error | Agent Skills spec limits: description ≤1024, compatibility ≤500, metadata string→string, allowed-tools a string |
| SF017 | error | field violates a contract pattern — this is what enforces the `memory`/`duration` vocabularies |

## Deploy, lockfile, drift

`sf deploy` runs lint (errors abort), verifies every declared secret
*resolves* (values are never read into output; `--dry-run` downgrades
failures to warnings so you can always see the plan), then compiles each
target:

- Flattens every skill to `<target-path>/<name>/`, carrying references/,
  scripts/ (exec bits kept), assets/, and any other files.
- Compiled frontmatter is pure spec: `version` becomes `metadata.version`;
  `memory`, `duration`, `apis`, `secrets`, `uses` move into an
  `<!-- skillfw … -->` comment.
- Rewrites relative links so they resolve after flattening; shared
  references land in `_shared/` (ignored by runtimes — no SKILL.md).
- `skillfw.lock` records every file written, per target, with a content
  hash per skill. Deploy deletes only files it previously wrote; it never
  touches files it didn't write. `--dry-run` prints the
  create/update/delete plan Terraform-style.

`sf diff` compares source, lockfile, and disk, and exits 1 on drift:
`stale` (source changed), `modified in target` (compiled output edited),
`missing in target`, `not deployed`, `removed from source`.

**Extending:** a deploy target is one entry in the `TARGETS` table
(`src/deploy.ts`); a secret provider is one case in `verifySecret`
(`src/secrets.ts`); a lint rule is one object in `RULES` (`src/lint.ts`).
Each new one needs a test and a row in the table above.
