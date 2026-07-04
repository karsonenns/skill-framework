import pc from 'picocolors';
import { findProjectRoot } from '../core/manifest.js';
import { UserError } from '../core/errors.js';
import { planDeploy, applyDeploy, checkSecrets, type DeployPlan } from '../deploy/engine.js';
import { formatFindings } from '../lint/format.js';

export interface DeployCommandOptions {
  targets: string[];
  dryRun: boolean;
}

export function runDeploy(cwd: string, opts: DeployCommandOptions): number {
  const root = findProjectRoot(cwd);
  if (!root) {
    throw new UserError(
      'No skillfw.yaml found in this directory or any parent.\n' +
        'Fix: cd into a skillfw project, or run `sf init` to create one.',
    );
  }

  const plan = planDeploy(root, opts.targets);

  // 1. Lint gate — never deploy a broken tree.
  if (plan.lint.errorCount > 0) {
    console.log(formatFindings(plan.lint, 'pretty'));
    console.log('');
    console.log(pc.red('✗ Deploy aborted: fix the lint errors above first.'));
    return 1;
  }
  if (plan.lint.warnCount > 0) {
    console.log(formatFindings(plan.lint, 'pretty'));
    console.log('');
  }

  // 2. Secrets gate — every declared secret must resolve. Values are never
  //    read into compiled output; this is a resolvability check only.
  const secretChecks = checkSecrets(root, plan.manifest, plan.tree);
  const failed = secretChecks.filter((c) => !c.ok);
  if (failed.length > 0) {
    const head = opts.dryRun
      ? pc.yellow(`⚠ ${failed.length} secret(s) would block a real deploy:`)
      : pc.red(`✗ Deploy aborted: ${failed.length} secret(s) cannot be resolved.`);
    console.log(head);
    for (const c of failed) {
      const used = c.usedBy.length > 0 ? ` (used by: ${c.usedBy.join(', ')})` : ' (declared but unused)';
      console.log(`  ${pc.bold(c.key)} -> ${c.reference}${used}`);
      console.log(`    ${c.reason}`);
    }
    if (!opts.dryRun) return 1;
    console.log('');
  }
  if (secretChecks.length > 0 && failed.length === 0) {
    console.log(pc.green(`✓ ${secretChecks.length} secret(s) resolve`));
    console.log('');
  }

  // 3. Plan / apply.
  printPlan(plan);
  const changes = plan.targets.reduce((n, t) => n + t.entries.length, 0);
  if (opts.dryRun) {
    console.log(pc.dim('Dry run: nothing was written.'));
    return 0;
  }
  if (changes === 0) {
    console.log(pc.green('✓ Everything up to date.'));
    return 0;
  }
  applyDeploy(plan, new Date().toISOString());
  console.log(pc.green(`✓ Deployed ${plan.targets.length} target(s); skillfw.lock updated.`));
  return 0;
}

function printPlan(plan: DeployPlan): void {
  let add = 0;
  let change = 0;
  let destroy = 0;
  for (const tp of plan.targets) {
    console.log(pc.bold(`Target ${tp.targetName} (${tp.outputPath}):`));
    if (tp.entries.length === 0) {
      console.log(pc.dim('  (no changes)'));
    }
    for (const e of tp.entries) {
      if (e.action === 'create') {
        add++;
        console.log(pc.green(`  + ${e.file}`));
      } else if (e.action === 'update') {
        change++;
        console.log(pc.yellow(`  ~ ${e.file}`));
      } else {
        destroy++;
        console.log(pc.red(`  - ${e.file}`));
      }
    }
    console.log('');
  }
  console.log(`Plan: ${add} to add, ${change} to change, ${destroy} to delete.`);
  console.log('');
}
