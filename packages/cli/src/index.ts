import { Command } from 'commander';
import pc from 'picocolors';
import { UserError } from './core/errors.js';
import { packageVersion } from './core/pkg.js';
import { runInit } from './commands/init.js';
import { runNewDomain, runNewSkill, runNewOrchestrator } from './commands/new.js';
import { runLint } from './commands/lint.js';
import { runValidate } from './commands/validate.js';
import { runDeploy } from './commands/deploy.js';
import { runDiff } from './commands/diff.js';
import type { LintFormat } from './lint/format.js';

const program = new Command();

program
  .name('sf')
  .description(
    'Skill Framework — organize, validate, and deploy AI agent skills at scale.\n' +
      'Works with any runtime that reads SKILL.md: Claude Code, Codex CLI, Gemini CLI, Cursor.',
  )
  .version(packageVersion(), '-v, --version', 'print the sf version');

program
  .command('init')
  .description('scaffold a new skill tree in the current (or given) directory')
  .argument('[dir]', 'directory to scaffold into', '.')
  .option('--saas', 'SaaS-company archetype: billing, support, product, engineering')
  .option('--solo', 'solo-operator archetype: admin, content, dev')
  .option('--force', 'scaffold even if the directory is not empty', false)
  .action((dir: string, opts: { saas?: boolean; solo?: boolean; force: boolean }) => {
    if (opts.saas && opts.solo) {
      throw new UserError('Pick one archetype: --saas or --solo, not both.');
    }
    const archetype = opts.solo ? 'solo' : 'saas';
    runInit(dir, { archetype, force: opts.force });
  });

const newCmd = program
  .command('new')
  .description('create a domain, skill, or orchestrator from a template');
newCmd
  .command('domain')
  .description('create skills/domains/<name>/')
  .argument('<name>', 'lowercase-hyphenated domain name, e.g. billing')
  .action((name: string) => runNewDomain(name, process.cwd()));
newCmd
  .command('skill')
  .description('create skills/domains/<domain>/<name>/SKILL.md — passes lint immediately')
  .argument('<spec>', '<domain>/<name>, e.g. billing/invoice-dispute')
  .action((spec: string) => runNewSkill(spec, process.cwd()));
newCmd
  .command('orchestrator')
  .description('create skills/orchestrators/<name>/SKILL.md')
  .argument('<name>', 'lowercase-hyphenated workflow name, e.g. month-end-close')
  .action((name: string) => runNewOrchestrator(name, process.cwd()));

program
  .command('lint')
  .description('lint a skill tree (any directory of skills, not just sf projects)')
  .argument('[path]', 'directory to lint; defaults to the enclosing sf project')
  .option('--format <format>', 'output format: pretty, json, or github', 'pretty')
  .option('--fix', 'apply safe fixes only (chmod +x scripts, name casing)', false)
  .action((target: string | undefined, opts: { format: string; fix: boolean }) => {
    if (!['pretty', 'json', 'github'].includes(opts.format)) {
      throw new UserError(
        `Unknown format \`${opts.format}\`. Fix: use --format pretty, json, or github.`,
      );
    }
    process.exitCode = runLint(target, process.cwd(), {
      format: opts.format as LintFormat,
      fix: opts.fix,
    });
  });

program
  .command('validate')
  .description('validate skillfw.yaml alone (lint includes this)')
  .action(() => runValidate(process.cwd()));

program
  .command('deploy')
  .description('compile the tree to each configured runtime target (lints first)')
  .option('--target <target...>', 'deploy only these targets (default: all in skillfw.yaml)')
  .option('--dry-run', 'print the plan Terraform-style; write nothing', false)
  .action((opts: { target?: string[]; dryRun: boolean }) => {
    process.exitCode = runDeploy(process.cwd(), {
      targets: opts.target ?? [],
      dryRun: opts.dryRun,
    });
  });

program
  .command('diff')
  .description('report drift between the lockfile, the source tree, and deployed targets')
  .action(() => {
    process.exitCode = runDiff(process.cwd());
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof UserError) {
    console.error(pc.red(`error: ${err.message}`));
    process.exitCode = 1;
  } else {
    throw err;
  }
}
