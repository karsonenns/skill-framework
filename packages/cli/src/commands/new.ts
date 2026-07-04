import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { UserError } from '../core/errors.js';
import { findProjectRoot, loadManifest } from '../core/manifest.js';

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function requireProject(cwd: string): { root: string; skillsDir: string } {
  const root = findProjectRoot(cwd);
  if (!root) {
    throw new UserError(
      'Not inside a skillfw project (no skillfw.yaml found in this directory or any parent).\n' +
        'Fix: cd into your project, or run `sf init` to create one.',
    );
  }
  const manifest = loadManifest(root);
  return { root, skillsDir: path.join(root, manifest.skills_dir) };
}

function requireValidName(name: string, what: string): void {
  if (!NAME_RE.test(name)) {
    throw new UserError(
      `\`${name}\` is not a valid ${what} name.\n` +
        'Fix: use lowercase letters, digits, and single hyphens, e.g. `invoice-dispute`.',
    );
  }
}

export function runNewDomain(name: string, cwd: string): void {
  requireValidName(name, 'domain');
  const { skillsDir } = requireProject(cwd);
  const dir = path.join(skillsDir, 'domains', name);
  if (existsSync(dir)) {
    throw new UserError(`Domain already exists: ${dir}.\nFix: pick another name or add skills to it with \`sf new skill ${name}/<skill>\`.`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '.gitkeep'), '');
  console.log(pc.green(`✓ Created domain skills/domains/${name}/`));
  console.log(`  Add a skill: sf new skill ${name}/<skill-name>`);
}

export function runNewSkill(spec: string, cwd: string): void {
  const parts = spec.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new UserError(
      `\`${spec}\` is not a valid skill spec.\nFix: use <domain>/<skill-name>, e.g. \`sf new skill billing/invoice-dispute\`.`,
    );
  }
  const [domain, name] = parts as [string, string];
  requireValidName(domain, 'domain');
  requireValidName(name, 'skill');
  const { skillsDir } = requireProject(cwd);
  const domainDir = path.join(skillsDir, 'domains', domain);
  if (!existsSync(domainDir)) {
    throw new UserError(
      `Domain \`${domain}\` does not exist (looked in ${domainDir}).\n` +
        `Fix: create it first with \`sf new domain ${domain}\`.`,
    );
  }
  const dir = path.join(domainDir, name);
  if (existsSync(dir)) {
    throw new UserError(`Skill already exists: ${dir}.`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), skillTemplate(name, domain));
  console.log(pc.green(`✓ Created skills/domains/${domain}/${name}/SKILL.md`));
  console.log('  Edit the description and instructions, then run `sf lint`.');
}

export function runNewOrchestrator(name: string, cwd: string): void {
  requireValidName(name, 'orchestrator');
  const { skillsDir } = requireProject(cwd);
  const dir = path.join(skillsDir, 'orchestrators', name);
  if (existsSync(dir)) {
    throw new UserError(`Orchestrator already exists: ${dir}.`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), orchestratorTemplate(name));
  console.log(pc.green(`✓ Created skills/orchestrators/${name}/SKILL.md`));
  console.log('  List the domain skills it composes under `uses:`, then run `sf lint`.');
}

// Templates must pass `sf lint` with zero findings out of the box.

function skillTemplate(name: string, domain: string): string {
  const title = titleCase(name);
  return `---
name: ${name}
description: Handle ${title.toLowerCase()} tasks. Use when asked to work on ${title.toLowerCase()} in the ${domain} domain.
version: 0.1.0
domain: ${domain}
---

# ${title}

## When to use this skill

Describe the trigger conditions so an agent knows when to load this skill.

## Procedure

1. Replace these steps with the actual procedure.
2. Keep the body under the token budget; move detail into \`references/\`.

## Boundaries

- What this skill must NOT do (escalation criteria, approval gates).
`;
}

function orchestratorTemplate(name: string): string {
  const title = titleCase(name);
  return `---
name: ${name}
description: Run the ${title.toLowerCase()} workflow end to end. Use when asked to ${title.toLowerCase()}.
version: 0.1.0
uses: []
---

# ${title}

Cross-domain workflow. List the domain skills this orchestrator composes in
\`uses:\` above — it must not duplicate their instructions.

## Steps

1. Replace with workflow steps, referencing domain skills by name.
`;
}

function titleCase(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
