// harness sync: copies or refreshes the files the harness generates in a project.
// `harness check` fails while any of them is stale.
//
//   .claude/agents/<role>.md       the team (agents/)
//   .githooks/pre-push             refuses pushes to the default branch (hooks/pre-push)
//   .claude/settings.json          the deny and ask rules below, merged into the project's own
//   docs/decisions/README.md       how the project registry works; its project section,
//                                  between two marker lines, is the project's own and kept
//   docs/decisions/_template-*.md  the record templates
//   docs/tasks/_template.md        the task template
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { read } from './frontmatter.mjs';
import { HARNESS_ROOT } from './paths.mjs';

export const DEFAULT_BRANCH_FILE = '.harness/default-branch';
export const SETTINGS_FILE = '.claude/settings.json';
const BRANCH = /^[\w./-]+$/;

export function defaultBranch(projectDir) {
  const path = join(projectDir, DEFAULT_BRANCH_FILE);
  const name = existsSync(path) ? read(path).trim() : '';
  if (name && !BRANCH.test(name)) throw new Error(`${DEFAULT_BRANCH_FILE}: "${name}" isn't a branch name`);
  return name || 'main';
}

// Claude Code permission rules: never push to the default branch, never skip hooks, and
// always ask a human before a command that carries --confirmed, or that starts a workflow with
// confirmed=true directly instead of through harness nas --remote (G-0011, G-0027).
export function requiredSettings(branch) {
  const push = [
    `git push origin ${branch}:*`,
    `git push origin ${branch}`,
    `git push origin HEAD:${branch}:*`,
    `git push origin HEAD:${branch}`,
    `git push origin *:${branch}:*`,
    `git push origin *:${branch}`,
    `git push origin *:refs/heads/${branch}:*`,
    `git push origin *:refs/heads/${branch}`,
    `git push --force origin ${branch}:*`,
    `git push --force origin HEAD:${branch}:*`,
    `git push -f origin ${branch}:*`,
    `git push -f origin HEAD:${branch}:*`,
    `git push --force-with-lease origin ${branch}:*`,
    `git push --force-with-lease origin HEAD:${branch}:*`,
    `git push -u origin ${branch}:*`,
    `git push --set-upstream origin ${branch}:*`,
    'git push --no-verify:*',
    'git push * --no-verify:*',
    'git push * --no-verify',
  ];
  const tools = ['Bash', 'PowerShell'];
  return {
    deny: tools.flatMap((t) => push.map((p) => `${t}(${p})`)),
    ask: tools.flatMap((t) => [`${t}(*--confirmed*)`, `${t}(*confirmed=true*)`]),
  };
}

// Adds the required rules to the project's settings without dropping or reordering its own.
export function mergeSettings(existing, required) {
  const merged = { ...existing, permissions: { ...(existing.permissions ?? {}) } };
  for (const key of ['deny', 'ask']) {
    const have = Array.isArray(merged.permissions[key]) ? merged.permissions[key] : [];
    merged.permissions[key] = [...have, ...required[key].filter((r) => !have.includes(r))];
  }
  return merged;
}

// The registry README ends with a section between these two marker lines that belongs to
// the project: sync keeps what is there, so check never reports it as stale.
export const README_FILE = 'docs/decisions/README.md';
export const SECTION_START = '<!-- harness:project-section:start -->';
export const SECTION_END = '<!-- harness:project-section:end -->';

// What is between the marker lines, or undefined when the text has none. Throws when a
// marker is missing, repeated or out of order, so sync never drops what a project wrote.
export function projectSection(text, label = README_FILE) {
  const count = (marker) => text.split(marker).length - 1;
  const [starts, ends] = [count(SECTION_START), count(SECTION_END)];
  if (starts === 0 && ends === 0) return undefined;
  const from = text.indexOf(SECTION_START) + SECTION_START.length;
  const to = text.indexOf(SECTION_END);
  if (starts !== 1 || ends !== 1 || to < from)
    throw new Error(
      `${label}: the project section's marker lines are damaged; it needs one "${SECTION_START}" line followed by one "${SECTION_END}" line. Restore them, then run harness sync`,
    );
  return text.slice(from, to);
}

// The template, with the project's own section when the existing file has one.
export function withProjectSection(template, existing, label = README_FILE) {
  const own = existing === undefined ? undefined : projectSection(existing, label);
  if (own === undefined) return template;
  const from = template.indexOf(SECTION_START) + SECTION_START.length;
  return `${template.slice(0, from)}${own}${template.slice(template.indexOf(SECTION_END))}`;
}

function readSettings(projectDir) {
  const path = join(projectDir, SETTINGS_FILE);
  if (!existsSync(path)) return { $schema: 'https://json.schemastore.org/claude-code-settings.json' };
  try {
    return JSON.parse(read(path));
  } catch (e) {
    throw new Error(`${SETTINGS_FILE} isn't valid JSON (${e.message}); fix it, then run harness sync`);
  }
}

// Every generated file with the content it should have.
export function generatedFiles(projectDir) {
  const branch = defaultBranch(projectDir);
  const from = (...p) => read(join(HARNESS_ROOT, ...p));
  const existing = (rel) => (existsSync(join(projectDir, rel)) ? read(join(projectDir, rel)) : undefined);
  const files = readdirSync(join(HARNESS_ROOT, 'agents'))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ path: `.claude/agents/${f}`, content: from('agents', f) }));
  files.push(
    { path: '.githooks/pre-push', content: from('hooks', 'pre-push').replaceAll('__DEFAULT_BRANCH__', branch), executable: true },
    { path: README_FILE, content: withProjectSection(from('templates', 'decisions-README.md'), existing(README_FILE)) },
    { path: 'docs/decisions/_template-decision.md', content: from('templates', 'decision.md') },
    { path: 'docs/decisions/_template-question.md', content: from('templates', 'question.md') },
    { path: 'docs/tasks/_template.md', content: from('templates', 'task.md') },
  );
  const settings = readSettings(projectDir);
  const merged = mergeSettings(settings, requiredSettings(branch));
  // Left untouched when it already holds every rule, however the project formats it.
  if (JSON.stringify(merged) !== JSON.stringify(settings) || !existsSync(join(projectDir, SETTINGS_FILE)))
    files.push({ path: SETTINGS_FILE, content: `${JSON.stringify(merged, null, 2)}\n` });
  return files;
}

// The generated files that are missing or differ from what sync would write.
export function staleFiles(projectDir) {
  return generatedFiles(projectDir)
    .filter((f) => {
      const path = join(projectDir, f.path);
      return !existsSync(path) || read(path) !== f.content;
    })
    .map((f) => f.path);
}

// Points git at .githooks, when the project is a git repository.
export function setHooksPath(projectDir) {
  if (!existsSync(join(projectDir, '.git'))) return false;
  try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: projectDir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Writes the generated files that are missing or stale. With `onlyMissing` it writes the
// missing ones only and leaves git's hooks path alone: nothing that exists is touched.
export function sync(projectDir, { onlyMissing = false } = {}) {
  const written = [];
  for (const f of generatedFiles(projectDir)) {
    const path = join(projectDir, f.path);
    if (existsSync(path) && (onlyMissing || read(path) === f.content)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.content);
    if (f.executable) {
      try {
        chmodSync(path, 0o755);
      } catch {
        // Not every file system has modes; git keeps the bit once it is recorded.
      }
    }
    written.push(f.path);
  }
  if (!onlyMissing) setHooksPath(projectDir);
  return written;
}

export function main(args, cwd = process.cwd()) {
  if (!existsSync(join(cwd, 'package.json'))) {
    console.error('✗ no package.json here: run harness sync in the project root');
    return 1;
  }
  try {
    const written = sync(cwd);
    console.log(written.length ? written.map((p) => `wrote ${p}`).join('\n') : '✓ generated files are current');
    return 0;
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 1;
  }
}

export function hooksMain(args, cwd = process.cwd()) {
  if (!setHooksPath(cwd)) console.warn('harness hooks: not a git repository, or git is missing; core.hooksPath not set');
  return 0;
}
