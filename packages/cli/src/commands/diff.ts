import pc from 'picocolors';
import { findProjectRoot } from '../core/manifest.js';
import { UserError } from '../core/errors.js';
import { diffDeploy, type DriftEntry, type DriftKind } from '../deploy/engine.js';

const KIND_LABEL: Record<DriftKind, string> = {
  'modified-in-target': 'modified in target',
  'missing-in-target': 'missing in target',
  stale: 'stale',
  'not-deployed': 'not deployed',
  'removed-from-source': 'removed from source',
};

/** Exit code 1 when drift exists — usable as a CI gate. */
export function runDiff(cwd: string): number {
  const root = findProjectRoot(cwd);
  if (!root) {
    throw new UserError(
      'No skillfw.yaml found in this directory or any parent.\n' +
        'Fix: cd into a skillfw project, or run `sf init` to create one.',
    );
  }
  const { drift, lock } = diffDeploy(root);
  if (!lock) {
    console.log(pc.yellow('No skillfw.lock found — nothing has been deployed yet.'));
    console.log('Run `sf deploy` to compile skills to your targets.');
    return 0;
  }
  if (drift.length === 0) {
    console.log(pc.green('✓ No drift: targets match the lockfile and the source tree.'));
    return 0;
  }
  let currentTarget = '';
  for (const d of drift) {
    if (d.targetName !== currentTarget) {
      if (currentTarget !== '') console.log('');
      console.log(pc.bold(`Target ${d.targetName}:`));
      currentTarget = d.targetName;
    }
    console.log(`  ${colorKind(d)}  ${pc.bold(d.skill)}  ${pc.dim(d.detail)}`);
  }
  console.log('');
  console.log(`${drift.length} drift finding(s). Run \`sf deploy\` to reconcile.`);
  return 1;
}

function colorKind(d: DriftEntry): string {
  const label = KIND_LABEL[d.kind].padEnd(20);
  switch (d.kind) {
    case 'modified-in-target':
    case 'missing-in-target':
      return pc.red(label);
    case 'stale':
    case 'not-deployed':
      return pc.yellow(label);
    case 'removed-from-source':
      return pc.magenta(label);
  }
}
