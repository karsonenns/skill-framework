import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { makeTree } from './helpers.js';
import { lintPath } from '../src/lint.js';
import { packageRoot } from '../src/core.js';

const bin = path.join(packageRoot(), 'bin', 'sf.js');
const sf = (args: string[], cwd: string, env: Record<string, string> = {}) =>
  execFileSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

it('init -> new -> lint -> deploy -> diff works end to end via the binary', () => {
  const dir = makeTree({});
  assert.match(sf(['init'], dir), /Scaffolded/);
  assert.ok(existsSync(path.join(dir, '.gitignore')));
  sf(['new', 'skill', 'transportation/ground/mrap'], dir);
  sf(['new', 'outcome', 'convoy-to-safehouse'], dir);
  assert.match(sf(['lint'], dir), /no problems/);
  assert.deepEqual(lintPath(dir).findings, []); // scaffolded + templated tree: zero findings
  assert.match(sf(['validate'], dir), /is valid/);

  const dry = sf(['deploy', '--dry-run'], dir);
  assert.match(dry, /Plan:/);
  assert.match(dry, /Dry run: nothing was written\./);
  assert.ok(!existsSync(path.join(dir, '.claude/skills')));

  // a real deploy blocks on the unresolvable secret, then succeeds with it
  assert.throws(() => sf(['deploy', '--target', 'claude-code'], dir));
  sf(['deploy', '--target', 'claude-code'], dir, { FLIGHT_OPS_TOKEN: 'x' });
  assert.ok(existsSync(path.join(dir, 'skillfw.lock')));
  assert.match(sf(['diff'], dir), /No drift/);
});

it('init refuses non-empty dirs; lint exits 1 with json findings on errors', () => {
  const dir = makeTree({ 'existing.txt': 'hi' });
  let refusal = '';
  try { sf(['init'], dir); } catch (err) { refusal = String((err as { stderr: string }).stderr); }
  assert.match(refusal, /--force/);
  sf(['init', '--force'], dir);
  mkdirSync(path.join(dir, 'skills/outcome/broken'));
  writeFileSync(path.join(dir, 'skills/outcome/broken/SKILL.md'), 'no frontmatter\n');
  let out: { errorCount: number; findings: Array<{ ruleId: string }> } | null = null;
  try { sf(['lint', '--format', 'json'], dir); } catch (err) {
    out = JSON.parse((err as { stdout: string }).stdout);
  }
  assert.ok(out, 'lint should exit 1');
  assert.ok(out.errorCount > 0);
  assert.ok(out.findings.some((f) => f.ruleId === 'SF002'));
});
