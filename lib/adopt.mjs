// harness adopt [--write] [login...] [--default-branch <name>]: brings the harness into a
// repository that already has registries, a hook or agent files of its own.
//
// Without --write it only reports and changes nothing:
//   - what it found: the decisions, questions and tasks that are already there;
//   - what it keeps: the project's own files, which nothing overwrites;
//   - what it would add: the files that are missing;
//   - what differs: files the harness generates that exist here with other content. adopt
//     leaves them alone; `harness sync` replaces them once the project has moved what it
//     wants to keep;
//   - what `harness check` will say about the existing records;
//   - the candidates: project decisions that look like a global decision (see below).
// With --write it adds what is missing and nothing else. It never overwrites a file.
//
// The matching heuristic, kept simple on purpose. A project decision and a global decision
// are each reduced to the words of their title and description: lower-cased, split on
// anything that isn't a letter or a digit, without words shorter than three letters and
// the stop words below, and without a final "s". A pair is a candidate when the titles
// share at least two words, or the titles and descriptions together at least three. A
// pair's score is its shared words, with those in both titles counted twice; a decision's
// matches are listed best first, at most three, without any that score under two thirds of
// its best. Only Accepted records are compared, and a project decision is never matched
// with a global decision it already overrules. It finds likely pairs for a human or the
// architect to read; it decides nothing.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { read } from './frontmatter.mjs';
import { ATTRIBUTES_RULE, INIT_FILES, init, parseArgs } from './init.mjs';
import { GLOBAL_DECISIONS_DIR, INSTALLED_PATH, harnessVersion, isHarnessRepo } from './paths.mjs';
import { DEFAULT_DECISIONS_DIR, checkRegistry, readRecords } from './registry.mjs';
import { README_FILE, SETTINGS_FILE, generatedFiles } from './sync.mjs';
import { DEFAULT_TASKS_DIR, readTasks, renderIndex } from './tasks-index.mjs';

const STOP_WORDS = new Set(
  `the and for with that this from into not never only every each all any one new may can when then than which who what
   their them they there has have was were will own use uses used using through per also but unless are its out how
   where once does done isn doesn goes change changes changed pull request requests
   project projects decision decisions harness agent agents`.split(/\s+/),
);
export const MIN_SHARED_TITLE_WORDS = 2;
export const MIN_SHARED_WORDS = 3;
const MAX_MATCHES = 3;

// The significant words of a text, as a set.
export function words(text) {
  const out = new Set();
  for (const raw of String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (raw.length < 3 || STOP_WORDS.has(raw)) continue;
    const word = raw.length > 3 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw;
    if (!STOP_WORDS.has(word)) out.add(word);
  }
  return out;
}
const shared = (a, b) => [...a].filter((w) => b.has(w));

// [{ decision, matches: [{ global, sharedWords, sharedTitleWords }] }], best match first.
export function findCandidates(projectRecords, globalRecords) {
  const globals = globalRecords
    .filter((g) => g.status === 'Accepted')
    .map((g) => ({ record: g, title: words(g.title), all: words(`${g.title} ${g.description}`) }));
  return projectRecords
    .filter((r) => r.type === 'decision' && r.status === 'Accepted')
    .map((r) => {
      const title = words(r.title);
      const all = words(`${r.title} ${r.description}`);
      const matches = globals
        .filter((g) => !r.overrules.includes(g.record.id))
        .map((g) => ({ global: g.record, sharedWords: shared(all, g.all), sharedTitleWords: shared(title, g.title) }))
        .filter((m) => m.sharedTitleWords.length >= MIN_SHARED_TITLE_WORDS || m.sharedWords.length >= MIN_SHARED_WORDS)
        .map((m) => ({ ...m, score: m.sharedWords.length + m.sharedTitleWords.length }))
        .sort((a, b) => b.score - a.score);
      return { decision: r, matches: matches.filter((m) => m.score * 3 >= matches[0].score * 2).slice(0, MAX_MATCHES) };
    })
    .filter((c) => c.matches.length);
}

// Everything adopt reports. Reads only.
export function inspect(projectDir, globalDir = GLOBAL_DECISIONS_DIR) {
  const has = (rel) => existsSync(join(projectDir, rel));
  const decisionsDir = join(projectDir, DEFAULT_DECISIONS_DIR);
  const tasksDir = join(projectDir, DEFAULT_TASKS_DIR);
  const globals = readRecords(globalDir, 'global');
  const records = readRecords(decisionsDir, 'project');
  const { tasks, problems: taskProblems } = existsSync(tasksDir) ? readTasks(tasksDir) : { tasks: [], problems: [] };

  const kept = [];
  const add = [];
  const differs = [];
  const problems = [];

  for (const [rel, note] of Object.entries(INIT_FILES)) (has(rel) ? kept : add).push({ path: rel, note: has(rel) ? note : undefined });

  let generated = [];
  try {
    generated = generatedFiles(projectDir);
  } catch (e) {
    problems.push(e.message);
  }
  for (const f of generated) {
    if (!has(f.path)) add.push({ path: f.path });
    else if (read(join(projectDir, f.path)) !== f.content)
      differs.push({
        path: f.path,
        note:
          f.path === SETTINGS_FILE
            ? 'sync adds the push and --confirmed rules and keeps your own'
            : f.path === README_FILE
              ? 'sync replaces it; afterwards your own text goes in its project section, which sync keeps'
              : 'sync replaces it',
      });
  }

  const tasksIndex = `${DEFAULT_TASKS_DIR}/index.md`;
  if (!has(tasksIndex)) add.push({ path: tasksIndex });
  else if (read(join(projectDir, tasksIndex)) !== renderIndex(tasks))
    differs.push({ path: tasksIndex, note: 'harness tasks-index rewrites it from the task files' });

  const attributes = has('.gitattributes') ? read(join(projectDir, '.gitattributes')).split('\n') : [];
  if (!attributes.includes(ATTRIBUTES_RULE)) add.push({ path: '.gitattributes', note: `the line "${ATTRIBUTES_RULE}"` });

  let scripts = {};
  try {
    scripts = JSON.parse(read(join(projectDir, 'package.json'))).scripts ?? {};
  } catch (e) {
    problems.push(`package.json isn't valid JSON (${e.message})`);
  }
  const missing = ['preinstall', 'prepare'].filter((s) => scripts[s] === undefined);
  if (missing.length) add.push({ path: 'package.json', note: `the ${missing.join(' and ')} script${missing.length > 1 ? 's' : ''}` });
  if (scripts.prepare !== undefined && !/\bharness hooks\b/.test(scripts.prepare))
    kept.push({ path: 'package.json', note: 'its prepare script is yours: add "harness hooks" to it, so git uses .githooks' });
  if (scripts.preinstall !== undefined && !/pnpm/.test(scripts.preinstall))
    kept.push({ path: 'package.json', note: 'its preinstall script is yours: it should refuse installs that are not pnpm (G-0016)' });

  if (existsSync(decisionsDir)) {
    const globalIds = new Set(globals.map((g) => g.id));
    problems.push(...checkRegistry(decisionsDir, 'project', { label: DEFAULT_DECISIONS_DIR, globalIds }).problems);
  }
  problems.push(...taskProblems.map((p) => `${DEFAULT_TASKS_DIR}/${p}`));

  return {
    found: {
      decisions: records.filter((r) => r.type === 'decision').length,
      questions: records.filter((r) => r.type === 'question').length,
      tasks: tasks.length,
      hasDecisions: existsSync(decisionsDir),
      hasTasks: existsSync(tasksDir),
    },
    kept,
    add,
    differs,
    problems,
    candidates: findCandidates(records, globals),
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function render(report, { wrote } = {}) {
  const { found, kept, add, differs, problems, candidates } = report;
  const rows = (items) => items.map((i) => `  ${i.path}${i.note ? `: ${i.note}` : ''}`).join('\n');
  const out = [];
  out.push(
    wrote
      ? wrote.length
        ? `harness adopt --write added what was missing and overwrote nothing:\n${wrote.map((l) => `  ${l}`).join('\n')}`
        : 'harness adopt --write: nothing was missing, so nothing was written.'
      : `harness adopt: what adopting harness ${harnessVersion()} means here. Nothing was changed.`,
  );
  out.push(
    `Found\n  ${DEFAULT_DECISIONS_DIR}: ${found.hasDecisions ? `${plural(found.decisions, 'decision')}, ${plural(found.questions, 'question')}` : 'not there yet'}\n  ${DEFAULT_TASKS_DIR}: ${found.hasTasks ? plural(found.tasks, 'task') : 'not there yet'}`,
  );
  if (kept.length) out.push(`Kept as they are (nothing overwrites these)\n${rows(kept)}`);
  if (!wrote) out.push(add.length ? `Would add (harness adopt --write)\n${rows(add)}` : 'Would add\n  nothing: every file is there');
  if (differs.length)
    out.push(
      `Differs from what the harness generates (adopt leaves these alone; move what you want to keep, then run harness sync)\n${rows(differs)}`,
    );
  if (problems.length) out.push(`What harness check will report about what is here\n${problems.map((p) => `  ${p}`).join('\n')}`);
  if (candidates.length) {
    const lines = candidates.map(
      (c) =>
        `  ${c.decision.id} "${c.decision.title}" (${DEFAULT_DECISIONS_DIR}/${c.decision.file})\n${c.matches
          .map((m) => `    looks like ${m.global.id} "${m.global.title}" (shares: ${m.sharedWords.join(', ')})`)
          .join('\n')}`,
    );
    out.push(
      `Candidates to replace with a global decision (read both; the match is by shared words only)\n${lines.join('\n')}\n  When the global decision covers it: set status: Replaced and replaced_by: [G-NNNN], and move its index line to Replaced.\n  When the project differs on purpose: keep it and list the global decision in overrules: [G-NNNN].\n  The global records are in ${INSTALLED_PATH}/decisions/.`,
    );
  } else out.push('Candidates to replace with a global decision\n  none: no Accepted project decision shares enough words with a global one');
  const next = [];
  if (!wrote && add.length) next.push('harness adopt --write <engineer-github-login>...');
  if (differs.length) next.push('move what you want to keep out of the files that differ, then harness sync');
  next.push('harness check');
  out.push(`Next: ${next.join('; then ')}.`);
  return `${out.join('\n\n')}\n`;
}

export function main(args, cwd = process.cwd()) {
  if (!existsSync(join(cwd, 'package.json'))) {
    console.error('✗ no package.json here: run harness adopt in the root of a Node project');
    return 1;
  }
  if (isHarnessRepo(cwd)) {
    console.error('✗ this is the harness itself; adopt is for projects that install it');
    return 1;
  }
  const write = args.includes('--write');
  const parsed = parseArgs(args.filter((a) => a !== '--write'));
  if (parsed.error) {
    console.error(`✗ ${parsed.error}`);
    return 1;
  }
  let wrote;
  if (write) {
    try {
      wrote = init(cwd, { ...parsed, overwrite: false });
    } catch (e) {
      console.error(`✗ ${e.message}`);
      return 1;
    }
  }
  process.stdout.write(render(inspect(cwd), { wrote }));
  return 0;
}
