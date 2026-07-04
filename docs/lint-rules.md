# Lint rules

`sf lint` runs against any directory of skills — an sf-scaffolded tree, or an
existing `.claude/skills` you have never touched with sf. Findings print with
rule id, file, line, message, and a fix hint. `--format json` for machines,
`--format github` for PR annotations. Exit code is 1 if any `error`-severity
finding remains, 0 otherwise.

Severities are configurable per rule in `contracts/lint.yaml`
(`error | warn | off`). Defaults below.

---

## SF001 — SKILL.md missing or misnamed (error)

Every skill directory must contain a file named exactly `SKILL.md`.
`skill.md`, `Skill.md`, and `SKILLS.md` are flagged; in a structured tree,
directories under `domains/<domain>/` or `orchestrators/` with no SKILL.md
at all are flagged too.

**Why:** runtimes discover skills by this exact filename; a misnamed file is
a skill that silently never loads.
**Fix:** rename the file to `SKILL.md`.

## SF002 — Frontmatter missing or unparseable (error)

The file must start with a `---` YAML block that parses to a mapping.

**Why:** frontmatter is how agents decide when to load the skill; without it
the skill is invisible or misread.
**Fix:** start the file with `---`, add `name`/`description`/`version`,
close with `---`.

## SF003 — Missing required field (error)

`name`, `description`, and `version` are required (configurable via
`contracts/frontmatter.yaml`).

**Fix:** add the missing field.

## SF004 — Name/folder mismatch or bad casing (error)

The folder name must equal frontmatter `name`, and names must be
lowercase-hyphenated (`^[a-z0-9]+(-[a-z0-9]+)*$` by default).

**Why:** deploy uses the name as the output folder; a mismatch means the
deployed skill and the source disagree about identity.
**Fix:** rename folder or frontmatter to match. `sf lint --fix` repairs pure
casing differences in frontmatter.

## SF005 — Duplicate skill names (error)

Skill names must be unique across the whole tree, including across domains.

**Why:** deploy flattens all skills into one namespace per target; duplicates
would overwrite each other.
**Fix:** rename one of the skills.

## SF006 — Invalid semver (error)

`version` must be valid semver (`1.2.3`, `1.2.3-beta.1`). YAML numbers like
`1.0` are flagged with a hint to use three segments.

**Why:** `sf diff` reports stale deployments by version; that only works if
versions order correctly.

## SF007 — Description quality (warn)

Flags descriptions under 20 characters, or ones with no trigger language —
no "use when…"-style phrase and no leading action verb. Pure heuristic; no
LLM involved.

**Why:** agents choose skills by description. "Billing stuff" never gets
loaded at the right time.
**Fix:** say what the skill does AND when to use it.

## SF008 — Dead relative link (error)

Every relative markdown link in SKILL.md and reference files must resolve —
to the skill's own `references/`/`scripts/`, to shared `skills/references/`,
or to another skill.

**Why:** broken links are context the agent silently never gets.

## SF009 — Skill over token budget (warn)

Skill body exceeds `budgets.skill_tokens` (default 2000; estimated chars/4).

**Fix:** move detail into `references/` files, which load on demand.

## SF010 — Tree over description budget (warn)

The sum of all frontmatter descriptions exceeds `budgets.tree_tokens`
(default 60000).

**Why:** descriptions are loaded by every agent session — this is your fixed
context tax, and it grows one skill at a time.

## SF011 — Hardcoded credential (error)

Regex patterns for AWS access keys, `sk-`/`sk_live_` keys, GitHub tokens,
Slack tokens, PEM private-key headers, bearer tokens, and `password=`
literals, scanned across every file in every skill. Placeholders
(`password=$VAR`, `password=<yours>`) are not flagged.

**Why:** skills get committed, shared, and deployed to multiple runtimes —
the blast radius of one pasted key is the whole org.
**Fix:** declare the need in frontmatter `secrets:` and map it in
`skillfw.yaml`.

## SF012 — Undeclared secret (error)

A frontmatter `secrets:` key has no mapping under `secrets:` in
`skillfw.yaml`. Only checked inside a project (there is nothing to verify
against in a bare directory).

**Why:** the manifest is the audit trail of which skill needs what; an
undeclared secret is an invisible dependency that fails at runtime.

## SF013 — Unknown orchestrator reference (warn)

An orchestrator's `uses:` lists a skill name that does not exist in the tree.

**Why:** the orchestrator will hand off to a skill that is not there.

## SF014 — Script not executable (warn)

A file under `scripts/` lacks the execute bit (skipped on Windows).

**Fix:** `chmod +x`, or `sf lint --fix`.

## SF015 — Unknown frontmatter field (off by default)

A frontmatter field is not in the contract's `allowed` list. Enable with
`rules: { SF015: warn }` in `contracts/lint.yaml`.

**Why:** typo'd field names (`descriptoin:`) otherwise fail silently.
