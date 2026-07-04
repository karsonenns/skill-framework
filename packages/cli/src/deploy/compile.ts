import { readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import YAML from 'yaml';
import { listFilesRecursive, toPosix } from '../core/tree.js';
import type { SkillEntry, SkillTree } from '../core/types.js';
import type { DeployTarget } from './targets/types.js';

/** Frontmatter fields that are skillfw governance metadata, not part of the
 *  Agent Skills standard. Stripped into an HTML comment on deploy so nothing
 *  non-standard leaks into compiled frontmatter. `version` is also not a spec
 *  field — it is preserved as `metadata.version`, the spec's own pattern. */
const SF_FIELDS = ['domain', 'apis', 'secrets', 'uses'] as const;

/** Directory inside each target that holds shared org references. */
export const SHARED_DIR = '_shared';

export interface CompiledSkillFile {
  /** Path relative to the target output directory, POSIX separators. */
  path: string;
  content: Buffer;
  executable: boolean;
}

export interface CompiledSkill {
  name: string;
  version: string;
  files: CompiledSkillFile[];
  /** sha256-… content hash over the skill's compiled files. */
  hash: string;
}

export interface CompiledTarget {
  target: DeployTarget;
  /** Output path relative to project root (from the manifest). */
  outputPath: string;
  skills: CompiledSkill[];
  sharedFiles: CompiledSkillFile[];
  /** All files, skills + shared. */
  allFiles: CompiledSkillFile[];
}

/**
 * Compile a structured tree for one target: flatten domains/* and
 * orchestrators/* into `<skill-name>/`, carry references/ and scripts/,
 * copy shared references into `_shared/`, rewrite relative links so they
 * still resolve after flattening.
 */
export function compileTree(
  tree: SkillTree,
  target: DeployTarget,
  outputPath: string,
): CompiledTarget {
  const sharedRoot = path.join(tree.skillsDir, 'references');
  const skillDirByPath = new Map<string, string>(); // abs skill dir -> compiled name
  for (const s of tree.skills) {
    const name = s.frontmatter?.name;
    if (typeof name === 'string' && name !== '') skillDirByPath.set(s.dir, name);
  }

  const rewriter = (fromCompiledFile: string, absSourceFile: string, link: string): string =>
    rewriteLink(fromCompiledFile, absSourceFile, link, sharedRoot, skillDirByPath);

  const skills: CompiledSkill[] = [];
  for (const skill of tree.skills) {
    const compiled = compileSkill(skill, rewriter, target);
    if (compiled) skills.push(compiled);
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));

  const sharedFiles: CompiledSkillFile[] = [];
  for (const abs of tree.sharedReferences) {
    const rel = toPosix(path.relative(sharedRoot, abs));
    const outPath = `${SHARED_DIR}/references/${rel}`;
    sharedFiles.push(
      makeFile(outPath, abs, abs.endsWith('.md') ? rewriter : undefined, target),
    );
  }

  return {
    target,
    outputPath,
    skills,
    sharedFiles,
    allFiles: [...skills.flatMap((s) => s.files), ...sharedFiles],
  };
}

function compileSkill(
  skill: SkillEntry,
  rewriter: (fromCompiled: string, absSource: string, link: string) => string,
  target: DeployTarget,
): CompiledSkill | null {
  const name = skill.frontmatter?.name;
  if (!skill.skillMdPath || !skill.raw || typeof name !== 'string' || name === '') return null;
  const version =
    typeof skill.frontmatter?.version === 'string' ? skill.frontmatter.version : '0.0.0';

  const files: CompiledSkillFile[] = [];

  // SKILL.md with sf-specific fields moved into an HTML comment header.
  let content = transformSkillMd(skill);
  content = rewriteLinksInMarkdown(content, `${name}/SKILL.md`, skill.skillMdPath, rewriter);
  files.push(applyTransform(target, {
    path: `${name}/SKILL.md`,
    content: Buffer.from(content, 'utf8'),
    executable: false,
  }));

  // Carry everything else in the skill directory — references/, scripts/,
  // assets/, and any additional files the spec allows.
  for (const abs of listFilesRecursive(skill.dir)) {
    if (abs === skill.skillMdPath) continue;
    const rel = toPosix(path.relative(skill.dir, abs));
    const outPath = `${name}/${rel}`;
    files.push(makeFile(outPath, abs, abs.endsWith('.md') ? rewriter : undefined, target));
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { name, version, files, hash: hashFiles(files) };
}

function makeFile(
  outPath: string,
  absSource: string,
  rewriter: ((fromCompiled: string, absSource: string, link: string) => string) | undefined,
  target: DeployTarget,
): CompiledSkillFile {
  let content: Buffer;
  if (rewriter) {
    const text = readFileSync(absSource, 'utf8');
    content = Buffer.from(
      rewriteLinksInMarkdown(text, outPath, absSource, rewriter),
      'utf8',
    );
  } else {
    content = readFileSync(absSource);
  }
  const executable =
    process.platform !== 'win32' && (statSync(absSource).mode & 0o111) !== 0;
  return applyTransform(target, { path: outPath, content, executable });
}

function applyTransform(target: DeployTarget, file: CompiledSkillFile): CompiledSkillFile {
  return target.transformFile ? target.transformFile(file) : file;
}

/** Move sf-specific frontmatter fields into an HTML comment after the frontmatter. */
export function transformSkillMd(skill: SkillEntry): string {
  const fm = skill.frontmatter;
  if (!fm || !skill.raw) return skill.raw ?? '';
  const kept: Record<string, unknown> = {};
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if ((SF_FIELDS as readonly string[]).includes(key)) stripped[key] = value;
    else if (key !== 'version') kept[key] = value;
  }
  // `version` is skillfw-required but not an Agent Skills spec field; the
  // spec stores versions under `metadata`. Valid semver always round-trips
  // as a YAML string (>= 2 dots), so no quoting is needed.
  if (typeof fm.version === 'string' || typeof fm.version === 'number') {
    const existing = kept['metadata'];
    const metadata =
      existing !== null && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    metadata['version'] = String(fm.version);
    kept['metadata'] = metadata;
  }
  // The spec defines allowed-tools as a space-separated string; normalize
  // lists in case SF016 was disabled.
  if (Array.isArray(kept['allowed-tools'])) {
    kept['allowed-tools'] = (kept['allowed-tools'] as unknown[]).map(String).join(' ');
  }
  const fmYaml = YAML.stringify(kept, { lineWidth: 0 }).trimEnd();
  let out = `---\n${fmYaml}\n---\n`;
  if (Object.keys(stripped).length > 0) {
    const strippedYaml = YAML.stringify(stripped, { lineWidth: 0 }).trimEnd();
    out += `\n<!-- skillfw\n${strippedYaml}\n-->\n`;
  }
  const body = skill.body.replace(/^\r?\n/, '');
  out += `\n${body}`;
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

const LINK_RE = /(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;

function rewriteLinksInMarkdown(
  text: string,
  compiledPath: string,
  absSourceFile: string,
  rewriter: (fromCompiled: string, absSource: string, link: string) => string,
): string {
  return text.replace(LINK_RE, (whole, pre: string, link: string, post: string) => {
    const rewritten = rewriter(compiledPath, absSourceFile, link);
    return rewritten === link ? whole : `${pre}${rewritten}${post}`;
  });
}

/**
 * Rewrite a relative link so it still resolves after flattening:
 *  - links into shared skills/references/  ->  _shared/references/…
 *  - links into another skill's directory  ->  <that-skill-name>/…
 *  - links within the same skill keep their shape (dir layout is preserved).
 */
function rewriteLink(
  fromCompiledFile: string,
  absSourceFile: string,
  link: string,
  sharedRoot: string,
  skillDirByPath: Map<string, string>,
): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#') || link.startsWith('/')) {
    return link;
  }
  const [pathPart, ...anchorParts] = link.split('#');
  if (!pathPart) return link;
  const anchor = anchorParts.length > 0 ? `#${anchorParts.join('#')}` : '';
  const absTarget = path.resolve(path.dirname(absSourceFile), decodeURIComponent(pathPart));

  let mappedTargetRel: string | null = null;
  if (isWithin(sharedRoot, absTarget)) {
    mappedTargetRel = `${SHARED_DIR}/references/${toPosix(path.relative(sharedRoot, absTarget))}`;
  } else {
    for (const [skillDir, skillName] of skillDirByPath) {
      if (isWithin(skillDir, absTarget)) {
        mappedTargetRel = `${skillName}/${toPosix(path.relative(skillDir, absTarget))}`;
        break;
      }
    }
  }
  if (mappedTargetRel === null) return link;

  const fromDir = path.posix.dirname(fromCompiledFile);
  let rel = path.posix.relative(fromDir, mappedTargetRel);
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return `${rel}${anchor}`;
}

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function hashFiles(files: CompiledSkillFile[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(f.path);
    h.update('\0');
    h.update(createHash('sha256').update(f.content).digest('hex'));
    h.update(f.executable ? '\0x' : '\0-');
    h.update('\n');
  }
  return `sha256-${h.digest('hex')}`;
}
