// Generates a task index from the task files' front matter (G-0012); a small task (G-0031)
// is marked "(small)".
//   harness tasks-index [dir]          rewrite <dir>/index.md (default docs/tasks)
//   harness tasks-index --check [dir]  fail if the index or a task file is out of step
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, read } from './frontmatter.mjs';

export const STATUSES = ['Open', 'Doing', 'Done', 'Dropped'];
// The architect sizes each task (G-0031). A task without a size counts as full, so tasks
// written before 0.9.0 need no change.
export const SIZES = ['small', 'full'];
export const DEFAULT_TASKS_DIR = 'docs/tasks';

// Log entries: a line starting with "- ", plus its indented continuation lines.
export function logEntries(text) {
  const log = text.replace(/\r\n/g, '\n').split(/^# Log\s*$/m)[1] ?? '';
  const entries = [];
  for (const line of log.split('\n')) {
    if (line.startsWith('- ')) entries.push(line.slice(2).trim());
    else if (/^\s+\S/.test(line) && entries.length) entries[entries.length - 1] += ` ${line.trim()}`;
  }
  return entries;
}

export function readTasks(dir) {
  const problems = [];
  if (!existsSync(dir)) return { tasks: [], problems: [`${dir} doesn't exist`] };
  const tasks = readdirSync(dir)
    .filter((f) => /^T-\d{4}-.*\.md$/.test(f))
    .sort()
    .map((file) => {
      const text = read(join(dir, file));
      const { fields } = parse(text);
      const t = {
        file,
        id: fields.id,
        title: fields.title,
        description: fields.description,
        status: fields.status,
        size: fields.size === undefined || fields.size === '' ? 'full' : fields.size,
        doneOn: fields.done_on,
        log: logEntries(text),
      };
      if (!file.startsWith(`${t.id}-`)) problems.push(`${file}: id ${t.id} doesn't match the file name`);
      if (!t.title) problems.push(`${file}: no title`);
      if (!t.description) problems.push(`${file}: no description`);
      if (!STATUSES.includes(t.status)) problems.push(`${file}: status "${t.status}" isn't ${STATUSES.join('/')}`);
      if (!SIZES.includes(t.size)) problems.push(`${file}: size "${t.size}" isn't ${SIZES.join('/')}`);
      if (t.status === 'Done' && !/^\d{4}-\d{2}-\d{2}$/.test(t.doneOn ?? ''))
        problems.push(`${file}: Done but done_on is empty`);
      if (t.status !== 'Done' && t.doneOn) problems.push(`${file}: done_on is set but status is ${t.status}`);
      if ((t.status === 'Done' || t.status === 'Doing') && t.log.length === 0)
        problems.push(`${file}: ${t.status} but the Log is empty`);
      return t;
    });
  return { tasks, problems };
}

export function renderIndex(tasks) {
  const head = `# Tasks

Generated from the task files by \`harness tasks-index\`; don't edit by hand (G-0012).
One file per task, from [_template.md](_template.md). Pick from *Open* a task whose
\`depends_on\` are all Done. One task per session.
`;
  const sections = STATUSES.map((s) => {
    const rows = tasks.filter((t) => t.status === s);
    const body = rows.length
      ? rows.map((t) => `- [${t.id} ${t.title}](${t.file})${t.size === 'small' ? ' (small)' : ''}: ${t.description}`).join('\n')
      : 'None.';
    return `## ${s}\n\n${body}\n`;
  });
  return [head, ...sections].join('\n');
}

// The problems that make the check fail, and the tasks read.
export function checkTasks(dir, label = dir) {
  const { tasks, problems } = readTasks(dir);
  if (!existsSync(dir)) return { tasks, problems: [`${label} doesn't exist`] };
  const indexPath = join(dir, 'index.md');
  const have = existsSync(indexPath) ? read(indexPath) : undefined;
  if (have !== renderIndex(tasks))
    problems.push(`${label}/index.md is out of step with the task files: run harness tasks-index`);
  return { tasks, problems };
}

export function writeIndex(dir) {
  const { tasks, problems } = readTasks(dir);
  writeFileSync(join(dir, 'index.md'), renderIndex(tasks));
  return { tasks, problems };
}

export function main(args, cwd = process.cwd()) {
  const rel = args.find((a) => !a.startsWith('--')) ?? DEFAULT_TASKS_DIR;
  const dir = join(cwd, rel);
  if (args.includes('--check')) {
    const { tasks, problems } = checkTasks(dir, rel);
    if (problems.length) {
      console.error(problems.map((p) => `✗ ${p}`).join('\n'));
      return 1;
    }
    console.log(`✓ ${tasks.length} tasks, index in step`);
    return 0;
  }
  if (!existsSync(dir)) {
    console.error(`✗ ${rel} doesn't exist`);
    return 1;
  }
  const { tasks, problems } = readTasks(dir);
  // A size the team doesn't know is refused: no role would know how to run the task.
  const sizes = problems.filter((p) => /: size "/.test(p));
  if (sizes.length) {
    console.error(sizes.map((p) => `✗ ${p}`).join('\n'));
    return 1;
  }
  writeFileSync(join(dir, 'index.md'), renderIndex(tasks));
  if (problems.length) console.warn(problems.map((p) => `! ${p}`).join('\n'));
  console.log(`wrote ${rel}/index.md (${tasks.length} tasks)`);
  return 0;
}
