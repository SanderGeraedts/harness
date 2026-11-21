// harness check: everything CI checks about the way of working.
//
// In a project: the task index is in step, the decision index lists every record and
// nothing else, front matter is valid, every `overrules` (and every `replaced_by` with a
// G-NNNN id) names a global decision of the installed harness, the Engineers are listed,
// and the generated files are current, apart from the registry README's project section.
// In the harness itself: its own tasks, the global registry, the agent definitions and the skills.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, read } from './frontmatter.mjs';
import { GLOBAL_DECISIONS_DIR, HARNESS_ROOT, isHarnessRepo } from './paths.mjs';
import { DEFAULT_DECISIONS_DIR, checkRegistry, readRecords } from './registry.mjs';
import { ENGINEERS_FILE, readEngineers } from './role.mjs';
import { skillNames, staleFiles } from './sync.mjs';
import { DEFAULT_TASKS_DIR, checkTasks } from './tasks-index.mjs';

export function checkAgents(dir = join(HARNESS_ROOT, 'agents'), label = 'agents') {
  const problems = [];
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  if (files.length === 0) problems.push(`${label}: no agent definitions`);
  for (const f of files) {
    const { fields } = parse(read(join(dir, f)));
    if (fields.name !== f.replace(/\.md$/, '')) problems.push(`${label}/${f}: name "${fields.name}" doesn't match the file name`);
    if (!fields.description) problems.push(`${label}/${f}: no description`);
  }
  return { files, problems };
}

// Every folder in skills/ holds a SKILL.md whose name matches the folder, with a description.
export function checkSkills(dir = join(HARNESS_ROOT, 'skills'), label = 'skills') {
  const problems = [];
  const folders = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  const names = skillNames(dir);
  for (const f of folders.filter((f) => !names.includes(f))) problems.push(`${label}/${f}: no SKILL.md`);
  for (const n of names) {
    const { fields } = parse(read(join(dir, n, 'SKILL.md')));
    if (fields.name === undefined) problems.push(`${label}/${n}/SKILL.md: no name in its front matter`);
    else if (fields.name !== n) problems.push(`${label}/${n}/SKILL.md: name "${fields.name}" doesn't match the folder`);
    if (!fields.description) problems.push(`${label}/${n}/SKILL.md: no description`);
  }
  return { names, problems };
}

// Returns [{ name, ok, detail, problems }].
export function runChecks(dir) {
  const results = [];
  const add = (name, problems, detail) => results.push({ name, ok: problems.length === 0, detail, problems });

  const tasks = checkTasks(join(dir, DEFAULT_TASKS_DIR), DEFAULT_TASKS_DIR);
  add('tasks', tasks.problems, `${tasks.tasks.length} tasks, index in step`);

  if (isHarnessRepo(dir)) {
    const g = checkRegistry(join(dir, 'decisions'), 'global', { label: 'decisions' });
    add('global decisions', g.problems, `${g.records.length} records, index complete`);
    const a = checkAgents(join(dir, 'agents'));
    add('agents', a.problems, `${a.files.length} definitions`);
    const s = checkSkills(join(dir, 'skills'));
    add('skills', s.problems, `${s.names.length} skill${s.names.length === 1 ? '' : 's'}`);
    return results;
  }

  const globalIds = new Set(readRecords(GLOBAL_DECISIONS_DIR, 'global').map((r) => r.id));
  const d = checkRegistry(join(dir, DEFAULT_DECISIONS_DIR), 'project', { label: DEFAULT_DECISIONS_DIR, globalIds });
  const overrules = d.records.reduce((n, r) => n + r.overrules.length, 0);
  add('decisions', d.problems, `${d.records.length} records, index complete, ${overrules} overrule${overrules === 1 ? '' : 's'} valid`);

  const engineers = readEngineers(dir);
  add(
    'engineers',
    existsSync(join(dir, ENGINEERS_FILE))
      ? engineers.length
        ? []
        : [`${ENGINEERS_FILE} lists nobody: add the Engineers' GitHub logins, one per line`]
      : [`${ENGINEERS_FILE} doesn't exist: run harness init <login>`],
    `${engineers.length} listed`,
  );

  let stale;
  try {
    stale = staleFiles(dir).map((p) => `${p} is missing or stale: run harness sync`);
  } catch (e) {
    stale = [e.message];
  }
  add('generated files', stale, 'current');
  return results;
}

export function main(args, cwd = process.cwd()) {
  if (!existsSync(join(cwd, 'package.json'))) {
    console.error('✗ no package.json here: run harness check in the project root');
    return 1;
  }
  const results = runChecks(cwd);
  for (const r of results) {
    if (r.ok) console.log(`✓ ${r.name}: ${r.detail}`);
    else console.error(r.problems.map((p) => `✗ ${r.name}: ${p}`).join('\n'));
  }
  return results.every((r) => r.ok) ? 0 : 1;
}
