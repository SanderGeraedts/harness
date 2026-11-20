// harness waiting [dir...]: everything that waits on a human, per project folder
// (G-0013): open questions, tasks' `Remaining:` items, and open GitHub issues that are
// assigned to someone. `gh` may be absent; issues are then skipped.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { read } from './frontmatter.mjs';
import { DEFAULT_DECISIONS_DIR, readRecords } from './registry.mjs';
import { readEngineers } from './role.mjs';
import { DEFAULT_TASKS_DIR, logEntries, readTasks } from './tasks-index.mjs';

export function ghIssues(cwd) {
  try {
    const out = execFileSync('gh', ['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,url,assignees'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30000,
    });
    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

export function findWaiting(projectDir, getIssues = ghIssues) {
  const questions = readRecords(join(projectDir, DEFAULT_DECISIONS_DIR), 'project')
    .filter((r) => r.type === 'question' && r.status === 'Open')
    .map((q) => ({ id: q.id, title: q.title, file: `${DEFAULT_DECISIONS_DIR}/${q.file}` }));

  const tasksDir = join(projectDir, DEFAULT_TASKS_DIR);
  const remaining = (existsSync(tasksDir) ? readTasks(tasksDir).tasks : [])
    .filter((t) => t.status === 'Open' || t.status === 'Doing')
    .flatMap((t) => {
      const last = logEntries(read(join(tasksDir, t.file))).at(-1) ?? '';
      const at = last.indexOf('Remaining:');
      return at < 0 ? [] : [{ id: t.id, title: t.title, remaining: last.slice(at + 'Remaining:'.length).trim() }];
    });

  const engineers = readEngineers(projectDir).map((l) => l.toLowerCase());
  const all = getIssues(projectDir);
  const issues = (all ?? [])
    .filter((i) => i.assignees?.length)
    .map((i) => ({
      number: i.number,
      title: i.title,
      url: i.url,
      assignees: i.assignees.map((a) => ({ login: a.login, engineer: engineers.includes(a.login.toLowerCase()) })),
    }));
  return { questions, remaining, issues, issuesAvailable: all !== undefined };
}

export function renderWaiting(name, w) {
  const lines = [name];
  const section = (title, rows) => lines.push(`  ${title}`, ...(rows.length ? rows.map((r) => `    ${r}`) : ['    none']));
  section(
    'Open questions (wait for the Engineer)',
    w.questions.map((q) => `${q.id} ${q.title} (${q.file})`),
  );
  section(
    'Tasks with remaining checks',
    w.remaining.map((t) => `${t.id} ${t.title}: ${t.remaining}`),
  );
  if (w.issuesAvailable)
    section(
      'Assigned issues',
      w.issues.map((i) => `#${i.number} ${i.title} → ${i.assignees.map((a) => `@${a.login}${a.engineer ? ' (Engineer)' : ''}`).join(', ')} ${i.url}`),
    );
  else lines.push('  Assigned issues', '    skipped: gh is missing, not signed in, or this folder has no GitHub repository');
  return `${lines.join('\n')}\n`;
}

export function main(args, cwd = process.cwd()) {
  const dirs = args.filter((a) => !a.startsWith('--'));
  if (dirs.length === 0) dirs.push('.');
  let code = 0;
  const out = dirs.map((d) => {
    const dir = resolve(cwd, d);
    if (!existsSync(dir)) {
      code = 1;
      return `${d}\n  ✗ no such folder\n`;
    }
    return renderWaiting(basename(dir), findWaiting(dir));
  });
  process.stdout.write(out.join('\n'));
  return code;
}
