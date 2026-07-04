import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  bold, dim, estimateTokens, green, isValidSemver, lineOf, listFilesRecursive, NAME_RE,
  readTextFile, red, toPosix, yellow,
} from './core.js';
import {
  DEFAULT_CONTRACT, hasManifest, loadContract, loadLintConfig, loadManifest, MANIFEST,
  type FrontmatterContract, type LintConfig, type Manifest, type Severity,
} from './config.js';
import { frontmatterKeyLine, loadTree, type SkillEntry, type SkillTree } from './tree.js';

export interface Finding {
  ruleId: string;
  severity: Exclude<Severity, 'off'>;
  file: string; // relative to linted root, POSIX
  line?: number;
  message: string;
  fix?: string;
}

export interface LintResult {
  tree: SkillTree;
  findings: Finding[];
  errorCount: number;
  warnCount: number;
}

interface Ctx {
  tree: SkillTree;
  manifest: Manifest | null;
  contract: FrontmatterContract;
  budgets: { skill_tokens: number; tree_tokens: number };
  report(f: Omit<Finding, 'severity'>): void;
}

const rel = (tree: SkillTree, abs: string) => toPosix(path.relative(tree.root, abs));
const fmLine = (s: SkillEntry, key: string) => (s.raw ? frontmatterKeyLine(s.raw, key) : undefined);
/** Skills with a parsed SKILL.md. */
const parsed = (t: SkillTree) => t.skills.filter((s) => s.skillMdPath && s.frontmatter);

const TRIGGER_RE =
  /\buse (when|this|for|it|to)\b|\bwhen (the|a|an|you|asked|working|handling)\b|\btrigger|\binvoke|\bapplies to\b/i;
const ACTION_VERBS = new Set(
  ('analyze answer audit build check classify compose create debug deploy draft escalate evaluate extract find fix ' +
   'fly generate handle hoist investigate manage monitor navigate operate organize plan prepare process produce ' +
   'reconcile refund report rescue research resolve respond review route schedule search summarize track triage ' +
   'troubleshoot update validate verify write').split(' '),
);

// Placeholder values (password=$VAR, password=<yours>) are not flagged.
const CREDENTIAL_PATTERNS: Array<[string, RegExp]> = [
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['Stripe live secret key', /\bsk_live_[A-Za-z0-9]{10,}\b/],
  ['secret key (sk-…)', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['GitHub token', /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['bearer token', /\b[Bb]earer\s+[A-Za-z0-9\-._~+/]{25,}=*/],
  ['hardcoded password', /\bpassword\s*=\s*(?![$<{*])[^\s'"`]{6,}/i],
];

type Rule = { id: string; sev: Severity; check(ctx: Ctx): void };

const RULES: Rule[] = [
  { id: 'SF001', sev: 'error', check(ctx) { // SKILL.md missing or misnamed
    for (const dir of ctx.tree.emptySkillDirs) {
      ctx.report({ ruleId: 'SF001', file: rel(ctx.tree, dir),
        message: 'Skill directory has no SKILL.md.',
        fix: 'Create a SKILL.md with the required frontmatter, or remove the directory.' });
    }
    for (const s of ctx.tree.skills) for (const bad of s.misnamed) {
      ctx.report({ ruleId: 'SF001', file: rel(ctx.tree, path.join(s.dir, bad)),
        message: `Skill file is named \`${bad}\`; the spec requires exactly \`SKILL.md\`.`,
        fix: `Rename ${bad} to SKILL.md.` });
    }
  } },
  { id: 'SF002', sev: 'error', check(ctx) { // frontmatter parses
    for (const s of ctx.tree.skills) {
      if (!s.skillMdPath || s.frontmatter) continue;
      ctx.report({ ruleId: 'SF002', file: rel(ctx.tree, s.skillMdPath), line: 1,
        message: s.hasFrontmatterBlock
          ? `Frontmatter is not valid YAML: ${s.frontmatterError ?? 'parse error'}.`
          : 'SKILL.md has no YAML frontmatter block.',
        fix: 'Start the file with `---`, add name/description, close with `---`.' });
    }
  } },
  { id: 'SF003', sev: 'error', check(ctx) { // required fields per contract
    for (const s of parsed(ctx.tree)) for (const field of ctx.contract.required) {
      const v = s.frontmatter![field];
      if (v === undefined || v === null || v === '') {
        ctx.report({ ruleId: 'SF003', file: rel(ctx.tree, s.skillMdPath!), line: 1,
          message: `Missing required frontmatter field \`${field}\`.`,
          fix: `Add \`${field}:\` (required by contracts/frontmatter.yaml).` });
      }
    }
  } },
  { id: 'SF004', sev: 'error', check(ctx) { // name valid + matches folder
    const pattern = new RegExp(ctx.contract.patterns['name'] ?? NAME_RE.source);
    for (const s of parsed(ctx.tree)) {
      const name = s.frontmatter!.name;
      if (typeof name !== 'string' || !name) continue;
      const file = rel(ctx.tree, s.skillMdPath!);
      const line = fmLine(s, 'name');
      if (!pattern.test(name)) ctx.report({ ruleId: 'SF004', file, line,
        message: `Skill name \`${name}\` is not lowercase-hyphenated (must match ${pattern}).`,
        fix: `Rename to \`${suggestName(name)}\` in both frontmatter and folder name.` });
      if (name.length > 64) ctx.report({ ruleId: 'SF004', file, line,
        message: `Skill name is ${name.length} characters; the spec caps names at 64.`,
        fix: 'Shorten the name (folder and frontmatter together).' });
      if (name !== s.folderName) ctx.report({ ruleId: 'SF004', file, line,
        message: `Folder is \`${s.folderName}\` but frontmatter name is \`${name}\`; they must match.`,
        fix: `Rename the folder or the frontmatter name so they agree.` });
    }
  } },
  { id: 'SF005', sev: 'error', check(ctx) { // unique names
    const seen = new Map<string, string>();
    for (const s of parsed(ctx.tree)) {
      const name = s.frontmatter!.name;
      if (typeof name !== 'string' || !name) continue;
      const file = rel(ctx.tree, s.skillMdPath!);
      const first = seen.get(name);
      if (first) ctx.report({ ruleId: 'SF005', file, line: fmLine(s, 'name'),
        message: `Duplicate skill name \`${name}\` (also in ${first}); deploy flattens skills into one namespace.`,
        fix: 'Rename one of the skills.' });
      else seen.set(name, file);
    }
  } },
  { id: 'SF006', sev: 'error', check(ctx) { // semver
    for (const s of parsed(ctx.tree)) {
      const v = s.frontmatter!.version;
      if (v === undefined || v === null || v === '') continue;
      if (typeof v !== 'string' || !isValidSemver(v)) {
        ctx.report({ ruleId: 'SF006', file: rel(ctx.tree, s.skillMdPath!), line: fmLine(s, 'version'),
          message: `\`version: ${String(v)}\` is not valid semver${typeof v !== 'string' ? ' (quote it — YAML parsed a number)' : ''}.`,
          fix: 'Use MAJOR.MINOR.PATCH, e.g. `version: 1.0.0`.' });
      }
    }
  } },
  { id: 'SF007', sev: 'warn', check(ctx) { // description quality (heuristic, no LLM)
    for (const s of parsed(ctx.tree)) {
      const d = s.frontmatter!.description;
      if (typeof d !== 'string' || !d) continue;
      const file = rel(ctx.tree, s.skillMdPath!);
      const line = fmLine(s, 'description');
      if (d.trim().length < 20) ctx.report({ ruleId: 'SF007', file, line,
        message: `Description is ${d.trim().length} characters — too short for an agent to route on.`,
        fix: 'Say what the skill does AND when to use it.' });
      else if (!TRIGGER_RE.test(d) && !ACTION_VERBS.has(d.toLowerCase().match(/[a-z]+/)?.[0] ?? '')) {
        ctx.report({ ruleId: 'SF007', file, line,
          message: 'Description lacks trigger language — agents pick skills by description.',
          fix: 'Add "Use when …" or start with an action verb.' });
      }
    }
  } },
  { id: 'SF008', sev: 'error', check(ctx) { // dead relative links
    const files = new Set<string>(ctx.tree.sharedReferences.filter((f) => f.endsWith('.md')));
    for (const s of ctx.tree.skills) {
      if (s.skillMdPath) files.add(s.skillMdPath);
      for (const f of listFilesRecursive(s.dir)) if (f.endsWith('.md')) files.add(f);
    }
    for (const abs of files) {
      const text = readTextFile(abs);
      if (text === null) continue;
      for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1]!;
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('/')) continue;
        const clean = target.split('#')[0];
        if (!clean) continue;
        if (!existsSync(path.resolve(path.dirname(abs), decodeURIComponent(clean)))) {
          ctx.report({ ruleId: 'SF008', file: rel(ctx.tree, abs), line: lineOf(text, m.index ?? 0),
            message: `Dead relative link \`${target}\`.`,
            fix: 'Fix the path or create the file. Shared knowledge belongs in skills/references/.' });
        }
      }
    }
  } },
  { id: 'SF009', sev: 'warn', check(ctx) { // skill token budget
    for (const s of ctx.tree.skills) {
      if (!s.skillMdPath) continue;
      const tokens = estimateTokens(s.body);
      if (tokens > ctx.budgets.skill_tokens) {
        ctx.report({ ruleId: 'SF009', file: rel(ctx.tree, s.skillMdPath), line: s.bodyStartLine,
          message: `Skill body is ~${tokens} tokens; budget is ${ctx.budgets.skill_tokens}.`,
          fix: 'Move detail into references/ files, which load on demand.' });
      }
    }
  } },
  { id: 'SF010', sev: 'warn', check(ctx) { // tree description budget
    const total = parsed(ctx.tree).reduce(
      (n, s) => n + (typeof s.frontmatter!.description === 'string' ? estimateTokens(s.frontmatter!.description) : 0), 0);
    if (total > ctx.budgets.tree_tokens) {
      ctx.report({ ruleId: 'SF010', file: ctx.manifest ? MANIFEST : '.',
        message: `All descriptions together are ~${total} tokens; tree budget is ${ctx.budgets.tree_tokens}. Descriptions are always loaded.`,
        fix: 'Tighten descriptions, or raise budgets.tree_tokens in skillfw.yaml.' });
    }
  } },
  { id: 'SF011', sev: 'error', check(ctx) { // hardcoded credentials
    const scan = (abs: string) => {
      const text = readTextFile(abs);
      if (text === null) return;
      for (const [what, re] of CREDENTIAL_PATTERNS) {
        const m = re.exec(text);
        if (m) ctx.report({ ruleId: 'SF011', file: rel(ctx.tree, abs), line: lineOf(text, m.index),
          message: `Possible hardcoded credential (${what}). Skills are shared and deployed — never embed secrets.`,
          fix: 'Declare the need in frontmatter `secrets:` and map it in skillfw.yaml.' });
      }
    };
    for (const s of ctx.tree.skills) for (const f of listFilesRecursive(s.dir)) scan(f);
    for (const f of ctx.tree.sharedReferences) scan(f);
  } },
  { id: 'SF012', sev: 'error', check(ctx) { // secrets declared in manifest
    if (!ctx.manifest) return;
    for (const s of parsed(ctx.tree)) {
      const secrets = s.frontmatter!.secrets;
      if (!Array.isArray(secrets)) continue;
      for (const key of secrets) {
        if (typeof key === 'string' && !(key in ctx.manifest.secrets)) {
          ctx.report({ ruleId: 'SF012', file: rel(ctx.tree, s.skillMdPath!), line: fmLine(s, 'secrets'),
            message: `Skill declares secret \`${key}\`, but skillfw.yaml has no \`secrets.${key}\` mapping.`,
            fix: `Add \`${key}: env://${key}\` under \`secrets:\` in skillfw.yaml.` });
        }
      }
    }
  } },
  { id: 'SF013', sev: 'warn', check(ctx) { // outcome uses: names exist
    const names = new Set(parsed(ctx.tree).map((s) => s.frontmatter!.name));
    for (const s of parsed(ctx.tree)) {
      if (s.kind !== 'outcome' || !Array.isArray(s.frontmatter!.uses)) continue;
      for (const ref of s.frontmatter!.uses) {
        if (typeof ref === 'string' && !names.has(ref)) {
          ctx.report({ ruleId: 'SF013', file: rel(ctx.tree, s.skillMdPath!), line: fmLine(s, 'uses'),
            message: `Outcome \`uses: ${ref}\`, but no skill with that name exists.`,
            fix: 'Fix the name, or create the domain skill it composes.' });
        }
      }
    }
  } },
  { id: 'SF014', sev: 'warn', check(ctx) { // scripts executable
    if (process.platform === 'win32') return;
    for (const s of ctx.tree.skills) {
      const dir = path.join(s.dir, 'scripts');
      if (!existsSync(dir)) continue;
      for (const f of listFilesRecursive(dir)) {
        if ((statSync(f).mode & 0o111) === 0) {
          ctx.report({ ruleId: 'SF014', file: rel(ctx.tree, f),
            message: 'Script is not executable — agents invoking it directly will fail.',
            fix: `chmod +x ${rel(ctx.tree, f)} (or \`sf lint --fix\`).` });
        }
      }
    }
  } },
  { id: 'SF015', sev: 'off', check(ctx) { // unknown fields (opt-in)
    if (!ctx.contract.allowed) return;
    const allowed = new Set(ctx.contract.allowed);
    for (const s of parsed(ctx.tree)) for (const key of Object.keys(s.frontmatter!)) {
      if (!allowed.has(key)) ctx.report({ ruleId: 'SF015', file: rel(ctx.tree, s.skillMdPath!), line: fmLine(s, key),
        message: `Unknown frontmatter field \`${key}\` (not in contract \`allowed\`).`,
        fix: `Remove it, or add \`${key}\` to contracts/frontmatter.yaml.` });
    }
  } },
  { id: 'SF016', sev: 'error', check(ctx) { // Agent Skills spec field constraints
    for (const s of parsed(ctx.tree)) {
      const fm = s.frontmatter!;
      const file = rel(ctx.tree, s.skillMdPath!);
      const r = (key: string, message: string, fix: string) =>
        ctx.report({ ruleId: 'SF016', file, line: fmLine(s, key), message, fix });
      if (typeof fm.description === 'string' && fm.description.length > 1024) {
        r('description', `description is ${fm.description.length} characters; the spec caps it at 1024.`,
          'Tighten it — detail belongs in the body.');
      }
      const compat = fm['compatibility'];
      if (compat !== undefined && (typeof compat !== 'string' || !compat || compat.length > 500)) {
        r('compatibility', '`compatibility` must be a non-empty string of at most 500 characters.',
          'Shorten it, or drop the field (most skills do not need it).');
      }
      const meta = fm['metadata'];
      if (meta !== undefined) {
        if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
          r('metadata', '`metadata` must be a mapping of string keys to string values.', 'Use `metadata:\\n  author: org`.');
        } else {
          for (const [k, v] of Object.entries(meta)) if (typeof v !== 'string') {
            r('metadata', `metadata.${k} is not a string; the spec requires string values.`, `Quote it: \`${k}: "${String(v)}"\`.`);
          }
        }
      }
      if (fm['allowed-tools'] !== undefined && typeof fm['allowed-tools'] !== 'string') {
        r('allowed-tools', '`allowed-tools` must be a space-separated string, not a YAML list.',
          'Write `allowed-tools: Bash(git:*) Read` on one line.');
      }
      if (fm['license'] !== undefined && typeof fm['license'] !== 'string') {
        r('license', '`license` must be a string.', 'Write e.g. `license: MIT`.');
      }
    }
  } },
  { id: 'SF017', sev: 'error', check(ctx) { // contract pattern violations (memory/duration enums)
    for (const [field, pattern] of Object.entries(ctx.contract.patterns)) {
      if (field === 'name') continue; // SF004's job
      const re = new RegExp(pattern);
      for (const s of parsed(ctx.tree)) {
        const v = s.frontmatter![field];
        if (v === undefined || v === null || v === '') continue;
        if (typeof v !== 'string' || !re.test(v)) {
          ctx.report({ ruleId: 'SF017', file: rel(ctx.tree, s.skillMdPath!), line: fmLine(s, field),
            message: `\`${field}: ${String(v)}\` does not match the contract pattern ${pattern}.`,
            fix: 'Use one of the values the contract allows (see contracts/frontmatter.yaml).' });
        }
      }
    }
  } },
];

export function suggestName(name: string): string {
  return name.trim().toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

/** Lint any directory: sf projects get their contracts; bare trees get spec defaults. */
export function lintPath(target: string): LintResult {
  const tree = loadTree(target);
  const structured = tree.structured && hasManifest(tree.root);
  return lintTree(
    tree,
    structured ? loadManifest(tree.root) : null,
    structured ? loadContract(tree.root) : DEFAULT_CONTRACT,
    structured ? loadLintConfig(tree.root) : { rules: {}, budgets: {} },
  );
}

export function lintTree(
  tree: SkillTree,
  manifest: Manifest | null,
  contract: FrontmatterContract = DEFAULT_CONTRACT,
  config: LintConfig = { rules: {}, budgets: {} },
): LintResult {
  const budgets = {
    skill_tokens: config.budgets.skill_tokens ?? manifest?.budgets.skill_tokens ?? 2000,
    tree_tokens: config.budgets.tree_tokens ?? manifest?.budgets.tree_tokens ?? 60000,
  };
  const findings: Finding[] = [];
  for (const rule of RULES) {
    const severity = config.rules[rule.id] ?? rule.sev;
    if (severity === 'off') continue;
    rule.check({ tree, manifest, contract, budgets, report: (f) => findings.push({ ...f, severity }) });
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.ruleId.localeCompare(b.ruleId));
  return {
    tree, findings,
    errorCount: findings.filter((f) => f.severity === 'error').length,
    warnCount: findings.filter((f) => f.severity === 'warn').length,
  };
}

export type LintFormat = 'pretty' | 'json' | 'github';

export function formatFindings(result: LintResult, format: LintFormat): string {
  if (format === 'json') {
    return JSON.stringify({
      findings: result.findings, errorCount: result.errorCount,
      warnCount: result.warnCount, skillCount: result.tree.skills.length,
    }, null, 2);
  }
  if (format === 'github') {
    return result.findings.map((f) => {
      const msg = `${f.ruleId}: ${f.message}${f.fix ? ` Fix: ${f.fix}` : ''}`
        .replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
      const loc = f.line !== undefined ? `file=${f.file},line=${f.line}` : `file=${f.file}`;
      return `::${f.severity === 'error' ? 'error' : 'warning'} ${loc},title=${f.ruleId}::${msg}`;
    }).join('\n');
  }
  const lines: string[] = [];
  let current = '';
  for (const f of result.findings) {
    if (f.file !== current) {
      if (current) lines.push('');
      lines.push(bold(f.file));
      current = f.file;
    }
    lines.push(`  ${f.severity === 'error' ? red('error') : yellow('warn ')}  ${bold(f.ruleId)}${f.line !== undefined ? dim(`:${f.line}`) : ''}  ${f.message}`);
    if (f.fix) lines.push(`         ${dim(`fix: ${f.fix}`)}`);
  }
  if (result.findings.length) lines.push('');
  lines.push(result.findings.length === 0
    ? green(`✓ ${result.tree.skills.length} skill(s), no problems`)
    : `${red(`${result.errorCount} error(s)`)}, ${yellow(`${result.warnCount} warning(s)`)} across ${result.tree.skills.length} skill(s)`);
  return lines.join('\n');
}

/** Safe fixes only: chmod +x scripts (SF014), name casing (SF004). */
export function applySafeFixes(result: LintResult, tree: SkillTree): string[] {
  const applied = new Set<string>();
  for (const f of result.findings) {
    const abs = path.join(tree.root, f.file);
    if (f.ruleId === 'SF014') {
      chmodSync(abs, statSync(abs).mode | 0o755);
      applied.add(`chmod +x ${f.file}`);
    }
    if (f.ruleId === 'SF004') {
      const skill = tree.skills.find((s) => s.skillMdPath === abs);
      const name = skill?.frontmatter?.name;
      if (skill?.skillMdPath && typeof name === 'string' && suggestName(name) === skill.folderName) {
        const raw = readFileSync(skill.skillMdPath, 'utf8');
        const fixed = raw.replace(/^(name\s*:\s*).*$/m, `$1${skill.folderName}`);
        if (fixed !== raw) {
          writeFileSync(skill.skillMdPath, fixed, 'utf8');
          applied.add(`${f.file}: name -> ${skill.folderName}`);
        }
      }
    }
  }
  return [...applied];
}
