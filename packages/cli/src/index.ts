import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bold, dim, green, magenta, NAME_RE, packageRoot, packageVersion, red, UserError, yellow } from './core.js';
import { findProjectRoot, loadManifest, MANIFEST } from './config.js';
import { applySafeFixes, formatFindings, lintPath, type LintFormat } from './lint.js';
import { applyDeploy, checkSecrets, diffDeploy, planDeploy, type DeployPlan, type DriftKind } from './deploy.js';

const HELP = `sf — organize, validate, and deploy AI agent skills (SKILL.md) at scale.

Usage:
  sf init [dir] [--force]           scaffold the starter tree (refuses non-empty dirs)
  sf new skill <domain-path>/<name> create a domain skill, e.g. transportation/aviation/b-212
  sf new outcome <name>             create an outcome, e.g. extract-team-from-rooftop
  sf lint [path] [--format pretty|json|github] [--fix]
                                    lint any directory of skills; exit 1 on errors
  sf validate                       check skillfw.yaml alone
  sf deploy [--target <t>]... [--dry-run]
                                    lint, verify secrets, compile to each target
  sf diff                           report drift between lockfile, source, and targets
  sf --version | --help
`;

function parseArgs(argv: string[]) {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean | string[]>();
  const takesValue = new Set(['--format', '--target']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) { positionals.push(a); continue; }
    if (!takesValue.has(a)) { flags.set(a, true); continue; }
    const value = argv[++i];
    if (value === undefined) throw new UserError(`${a} needs a value.`);
    if (a === '--target') flags.set(a, [...((flags.get(a) as string[]) ?? []), value]);
    else flags.set(a, value);
  }
  return { positionals, flags };
}

function requireProject(): string {
  const root = findProjectRoot(process.cwd());
  if (!root) {
    throw new UserError(`No ${MANIFEST} found in this directory or any parent.\nFix: cd into a skillfw project, or run \`sf init\`.`);
  }
  return root;
}

function cmdInit(dir: string, force: boolean): void {
  const dest = path.resolve(dir);
  const source = path.join(packageRoot(), 'archetypes', 'starter');
  if (existsSync(dest)) {
    const entries = readdirSync(dest).filter((e) => e !== '.git');
    if (entries.length && !force) {
      throw new UserError(`Directory ${dest} is not empty (${entries.length} entries).\nFix: use an empty directory, or --force.`);
    }
  } else mkdirSync(dest, { recursive: true });
  cpSync(source, dest, { recursive: true, force: true });
  // npm strips .gitignore from tarballs; the archetype ships it as _gitignore.
  if (existsSync(path.join(dest, '_gitignore'))) renameSync(path.join(dest, '_gitignore'), path.join(dest, '.gitignore'));
  console.log(green(`✓ Scaffolded skill tree in ${dest}`));
  console.log(`\nNext:${dir === '.' ? '' : `\n  cd ${dir}`}\n  sf lint            # zero findings\n  sf deploy --dry-run`);
}

const SKILL_TEMPLATE = (name: string, title: string) => `---
name: ${name}
description: Operate ${title.toLowerCase()}. Use when a task requires ${title.toLowerCase()}.
version: 0.1.0
memory: procedure
duration: permanent
---

# ${title}

## When to use this skill

Describe the trigger conditions so an agent knows when to load this skill.

## Procedure

1. Replace with the actual procedure; keep it under the token budget.
2. Move detail into \`references/\`.

## Boundaries

- What this skill must NOT do.
`;

const OUTCOME_TEMPLATE = (name: string, title: string) => `---
name: ${name}
description: Achieve the outcome "${title.toLowerCase()}". Use when asked to ${title.toLowerCase()}.
version: 0.1.0
memory: judgment
duration: reinforced
uses: []
---

# ${title}

Composes domain skills by name — list them in \`uses:\`; do not duplicate
their instructions.

## Steps

1. Replace with steps that reference domain skills by name.
`;

const title = (name: string) => name.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');

function cmdNew(kind: string | undefined, spec: string | undefined): void {
  const root = requireProject();
  const skillsDir = path.join(root, loadManifest(root).skills_dir);
  if (kind === 'skill') {
    const parts = (spec ?? '').split('/').filter(Boolean);
    const name = parts.pop();
    if (!name || parts.length === 0) {
      throw new UserError('Usage: sf new skill <domain-path>/<name>, e.g. transportation/aviation/rotary-wing/b-212');
    }
    for (const seg of [...parts, name]) {
      if (!NAME_RE.test(seg)) throw new UserError(`\`${seg}\` is not lowercase-hyphenated (e.g. \`rotary-wing\`).`);
    }
    const dir = path.join(skillsDir, 'domain', ...parts, name);
    if (existsSync(dir)) throw new UserError(`Skill already exists: ${dir}.`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'SKILL.md'), SKILL_TEMPLATE(name, title(name)));
    console.log(green(`✓ Created skills/domain/${parts.join('/')}/${name}/SKILL.md`));
  } else if (kind === 'outcome') {
    if (!spec || !NAME_RE.test(spec)) {
      throw new UserError('Usage: sf new outcome <name> (lowercase-hyphenated), e.g. extract-team-from-rooftop');
    }
    const dir = path.join(skillsDir, 'outcome', spec);
    if (existsSync(dir)) throw new UserError(`Outcome already exists: ${dir}.`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'SKILL.md'), OUTCOME_TEMPLATE(spec, title(spec)));
    console.log(green(`✓ Created skills/outcome/${spec}/SKILL.md — list composed skills in \`uses:\``));
  } else {
    throw new UserError('Usage: sf new skill <domain-path>/<name> | sf new outcome <name>');
  }
  console.log('  Edit the description, then run `sf lint`.');
}

function cmdLint(target: string | undefined, format: LintFormat, fix: boolean): number {
  const dir = target ? path.resolve(target) : (findProjectRoot(process.cwd()) ?? process.cwd());
  let result = lintPath(dir);
  if (fix) {
    for (const applied of applySafeFixes(result, result.tree)) {
      if (format === 'pretty') console.log(green(`fixed: ${applied}`));
    }
    result = lintPath(dir);
  }
  console.log(formatFindings(result, format));
  return result.errorCount > 0 ? 1 : 0;
}

function cmdValidate(): void {
  const root = requireProject();
  const m = loadManifest(root);
  console.log(green(`✓ ${MANIFEST} is valid`));
  console.log(`  name: ${m.name}  skills: ${m.skills_dir}/  targets: ${Object.keys(m.targets).join(', ') || '(none)'}`);
  console.log(`  secrets: ${Object.keys(m.secrets).join(', ') || '(none)'}  budgets: ${m.budgets.skill_tokens}/skill, ${m.budgets.tree_tokens}/tree`);
}

function cmdDeploy(targets: string[], dryRun: boolean): number {
  const plan = planDeploy(requireProject(), targets);
  if (plan.lint.errorCount > 0) {
    console.log(formatFindings(plan.lint, 'pretty'));
    console.log(red('\n✗ Deploy aborted: fix the lint errors above first.'));
    return 1;
  }
  if (plan.lint.warnCount > 0) console.log(`${formatFindings(plan.lint, 'pretty')}\n`);

  const checks = checkSecrets(plan.root, plan.manifest, plan.tree);
  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.log(dryRun
      ? yellow(`⚠ ${failed.length} secret(s) would block a real deploy:`)
      : red(`✗ Deploy aborted: ${failed.length} secret(s) cannot be resolved.`));
    for (const c of failed) {
      console.log(`  ${bold(c.key)} -> ${c.reference}${c.usedBy.length ? ` (used by: ${c.usedBy.join(', ')})` : ' (unused)'}\n    ${c.reason}`);
    }
    if (!dryRun) return 1;
    console.log('');
  } else if (checks.length) console.log(green(`✓ ${checks.length} secret(s) resolve\n`));

  printPlan(plan);
  if (dryRun) { console.log(dim('Dry run: nothing was written.')); return 0; }
  if (!plan.targets.some((t) => t.entries.length)) { console.log(green('✓ Everything up to date.')); return 0; }
  applyDeploy(plan, new Date().toISOString());
  console.log(green(`✓ Deployed ${plan.targets.length} target(s); skillfw.lock updated.`));
  return 0;
}

function printPlan(plan: DeployPlan): void {
  let add = 0, change = 0, del = 0;
  for (const tp of plan.targets) {
    console.log(bold(`Target ${tp.targetName} (${tp.outputPath}):`));
    if (!tp.entries.length) console.log(dim('  (no changes)'));
    for (const e of tp.entries) {
      if (e.action === 'create') { add++; console.log(green(`  + ${e.file}`)); }
      else if (e.action === 'update') { change++; console.log(yellow(`  ~ ${e.file}`)); }
      else { del++; console.log(red(`  - ${e.file}`)); }
    }
    console.log('');
  }
  console.log(`Plan: ${add} to add, ${change} to change, ${del} to delete.\n`);
}

const DRIFT_LABEL: Record<DriftKind, string> = {
  'modified-in-target': 'modified in target', 'missing-in-target': 'missing in target',
  stale: 'stale', 'not-deployed': 'not deployed', 'removed-from-source': 'removed from source',
};

function cmdDiff(): number {
  const { drift, lock } = diffDeploy(requireProject());
  if (!lock) { console.log(yellow('No skillfw.lock — nothing deployed yet. Run `sf deploy`.')); return 0; }
  if (!drift.length) { console.log(green('✓ No drift: targets match the lockfile and the source tree.')); return 0; }
  let current = '';
  for (const d of drift) {
    if (d.targetName !== current) { if (current) console.log(''); console.log(bold(`Target ${d.targetName}:`)); current = d.targetName; }
    const label = DRIFT_LABEL[d.kind].padEnd(20);
    const color = d.kind === 'stale' || d.kind === 'not-deployed' ? yellow : d.kind === 'removed-from-source' ? magenta : red;
    console.log(`  ${color(label)}  ${bold(d.skill)}  ${dim(d.detail)}`);
  }
  console.log(`\n${drift.length} drift finding(s). Run \`sf deploy\` to reconcile.`);
  return 1;
}

try {
  const [cmd, ...restArgv] = process.argv.slice(2);
  const { positionals, flags } = parseArgs(restArgv);
  switch (cmd) {
    case 'init':
      cmdInit(positionals[0] ?? '.', flags.has('--force'));
      break;
    case 'new':
      cmdNew(positionals[0], positionals[1]);
      break;
    case 'lint': {
      const format = (flags.get('--format') as string) ?? 'pretty';
      if (!['pretty', 'json', 'github'].includes(format)) {
        throw new UserError(`Unknown format \`${format}\`. Fix: use --format pretty, json, or github.`);
      }
      process.exitCode = cmdLint(positionals[0], format as LintFormat, flags.has('--fix'));
      break;
    }
    case 'validate':
      cmdValidate();
      break;
    case 'deploy':
      process.exitCode = cmdDeploy((flags.get('--target') as string[]) ?? [], flags.has('--dry-run'));
      break;
    case 'diff':
      process.exitCode = cmdDiff();
      break;
    case '--version': case '-v': case 'version':
      console.log(packageVersion());
      break;
    case undefined: case '--help': case '-h': case 'help':
      console.log(HELP);
      break;
    default:
      throw new UserError(`Unknown command \`${cmd}\`. Run \`sf --help\`.`);
  }
} catch (err) {
  if (err instanceof UserError) {
    console.error(red(`error: ${err.message}`));
    process.exitCode = 1;
  } else throw err;
}
