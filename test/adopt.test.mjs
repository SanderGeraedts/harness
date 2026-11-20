import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { findCandidates, inspect, main, render, words } from '../lib/adopt.mjs';
import { runChecks } from '../lib/check.mjs';
import { GLOBAL_DECISIONS_DIR } from '../lib/paths.mjs';
import { readRecords } from '../lib/registry.mjs';
import { sync } from '../lib/sync.mjs';
import { cleanUp, decision, globalDecision, indexOf, task, tempDir, tempProject, write } from './helpers.mjs';

after(cleanUp);

// A repository that already works with decisions, tasks, a hook and agent files of its own.
const existing = () => {
  const dir = tempProject();
  write(dir, 'AGENTS.md', 'our rules\n');
  write(dir, 'docs/decisions/README.md', '# How we record decisions\n\nOur own text.\n');
  write(dir, 'docs/decisions/D-0001-pnpm.md', decision({ title: 'pnpm is the package manager' }));
  write(dir, 'docs/decisions/D-0002-colours.md', decision({ id: 'D-0002', title: 'The buttons are green' }));
  write(dir, 'docs/decisions/index.md', indexOf(['D-0001-pnpm.md', 'D-0002-colours.md']));
  write(dir, 'docs/tasks/T-0001-a.md', task());
  write(dir, 'docs/tasks/index.md', '# Our tasks\n\n- T-0001\n');
  write(dir, '.githooks/pre-push', '#!/bin/sh\necho ours\n');
  write(dir, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(pnpm test)'] } }));
  return dir;
};
const snapshot = (dir, rel = '') =>
  readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const path = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? snapshot(dir, path) : [[path, readFileSync(join(dir, path), 'utf8'), statSync(join(dir, path)).mtimeMs]];
  });
const paths = (items) => items.map((i) => i.path);
const captured = (fn) => {
  const lines = [];
  const [log, error, out] = [console.log, console.error, process.stdout.write];
  console.log = console.error = (l) => lines.push(`${l}\n`);
  process.stdout.write = (l) => lines.push(l);
  try {
    return { status: fn(), text: lines.join('') };
  } finally {
    [console.log, console.error, process.stdout.write] = [log, error, out];
  }
};

describe('adopt: matching project decisions with global ones', () => {
  it('reduces a text to its significant words', () => {
    assert.deepEqual([...words('The app uses PocketBase on the NAS, with snapshots; never a UUID.')], ['app', 'pocketbase', 'nas', 'snapshot', 'uuid']);
    assert.deepEqual([...words('Every project decision for agents')], []);
    assert.deepEqual([...words('Access to the address')], ['access', 'address']);
  });

  const globals = () => {
    const dir = tempDir();
    write(dir, 'G-0001-a.md', globalDecision({ id: 'G-0001', title: 'pnpm is the package manager, pinned in package.json' }));
    write(dir, 'G-0002-b.md', globalDecision({ id: 'G-0002', title: 'Never a UUID in a URL: addresses use readable slugs' }));
    write(dir, 'G-0003-c.md', globalDecision({ id: 'G-0003', title: 'pnpm was the package manager', status: 'Replaced', changed: '0.2.0', replacedBy: ['G-0001'] }));
    return readRecords(dir, 'global');
  };
  const project = (files) => {
    const dir = tempDir();
    for (const [file, text] of Object.entries(files)) write(dir, file, text);
    return readRecords(dir, 'project');
  };

  it('lists a decision whose title shares two words with a global one, best match first', () => {
    const found = findCandidates(
      project({
        'D-0001-a.md': decision({ title: 'We use pnpm as package manager' }),
        'D-0002-b.md': decision({ id: 'D-0002', title: 'The buttons are green' }),
        'D-0003-c.md': decision({ id: 'D-0003', title: 'Pages have slugs, never a UUID' }),
      }),
      globals(),
    );
    assert.deepEqual(found.map((c) => [c.decision.id, c.matches.map((m) => m.global.id)]), [['D-0001', ['G-0001']], ['D-0003', ['G-0002']]]);
    assert.deepEqual(found[0].matches[0].sharedTitleWords, ['pnpm', 'package', 'manager']);
  });

  it('also matches on three words shared between titles and descriptions', () => {
    const records = project({ 'D-0001-a.md': decision({ title: 'How we install' }) });
    records[0].description = 'Dependencies come from pnpm, the manager pinned for this package.';
    assert.deepEqual(findCandidates(records, globals()).map((c) => c.matches[0].sharedWords), [['pnpm', 'manager', 'pinned', 'package']]);
    records[0].description = 'Dependencies come from pnpm.';
    assert.deepEqual(findCandidates(records, globals()), []);
  });

  it('lists the best match first and leaves out matches far weaker than it', () => {
    const dir = tempDir();
    write(dir, 'G-0001-a.md', globalDecision({ id: 'G-0001', title: 'The backend is a database on the server' }));
    write(dir, 'G-0002-b.md', globalDecision({ id: 'G-0002', title: 'Backups of the database go to the server nightly' }));
    write(dir, 'G-0003-c.md', globalDecision({ id: 'G-0003', title: 'A script sets up hosting, the server and monitoring' }));
    const all = readRecords(dir, 'global');
    all[2].description = 'It creates the backend and its database.';
    const found = findCandidates(project({ 'D-0001-a.md': decision({ title: 'The backend is a database on the server' }) }), all);
    assert.deepEqual(found[0].matches.map((m) => [m.global.id, m.score]), [['G-0001', 8], ['G-0002', 6]]);
  });

  it('skips Replaced records on both sides, and a global decision the project already overrules', () => {
    const found = findCandidates(
      project({
        'D-0001-a.md': decision({ title: 'pnpm was the package manager', status: 'Replaced', replacedBy: ['D-0002'] }),
        'D-0002-b.md': decision({ id: 'D-0002', title: 'npm is the package manager, not pnpm', overrules: ['G-0001'] }),
      }),
      globals(),
    );
    assert.deepEqual(found, []);
  });

  it('finds a decision that matches a global decision of the real registry', () => {
    const records = project({ 'D-0001-a.md': decision({ title: 'pnpm is the package manager' }) });
    const found = findCandidates(records, readRecords(GLOBAL_DECISIONS_DIR, 'global'));
    assert.equal(found[0].matches[0].global.id, 'G-0016');
  });
});

describe('adopt', () => {
  it('reports what exists, what it would add and the candidates, and changes nothing', () => {
    const dir = existing();
    const before = snapshot(dir);
    const report = inspect(dir);
    assert.deepEqual(report.found, { decisions: 2, questions: 0, tasks: 1, hasDecisions: true, hasTasks: true });
    assert.deepEqual(paths(report.kept), ['docs/decisions/index.md', 'AGENTS.md']);
    assert.deepEqual(paths(report.add), [
      '.harness/engineers',
      'docs/lessons.md',
      'CLAUDE.md',
      '.nvmrc',
      '.claude/agents/architect.md',
      '.claude/agents/developer.md',
      '.claude/agents/tester.md',
      '.claude/agents/ux-designer.md',
      'docs/decisions/_template-decision.md',
      'docs/decisions/_template-question.md',
      'docs/tasks/_template.md',
      '.gitattributes',
      'package.json',
    ]);
    assert.deepEqual(paths(report.differs), ['.githooks/pre-push', 'docs/decisions/README.md', '.claude/settings.json', 'docs/tasks/index.md']);
    assert.deepEqual(report.problems, []);
    assert.deepEqual(report.candidates.map((c) => [c.decision.id, c.matches[0].global.id]), [['D-0001', 'G-0016']]);

    const { status, text } = captured(() => main([], dir));
    assert.equal(status, 0);
    assert.match(text, /^harness adopt: what adopting harness \d+\.\d+\.\d+ means here\. Nothing was changed\./);
    assert.match(text, /Found\n {2}docs\/decisions: 2 decisions, 0 questions\n {2}docs\/tasks: 1 task\n/);
    assert.match(text, /Kept as they are \(nothing overwrites these\)\n {2}docs\/decisions\/index\.md: .*\n {2}AGENTS\.md: add the pointers from /);
    assert.match(text, /Would add \(harness adopt --write\)\n {2}\.harness\/engineers\n/);
    assert.match(text, /Differs from what the harness generates .*\n {2}\.githooks\/pre-push: sync replaces it\n {2}docs\/decisions\/README\.md: .*project section/);
    assert.match(text, /Candidates to replace with a global decision .*\n {2}D-0001 "pnpm is the package manager" \(docs\/decisions\/D-0001-pnpm\.md\)\n {4}looks like G-0016 "pnpm is the package manager, pinned in package\.json" \(shares: pnpm, package, manager/);
    assert.doesNotMatch(text, /D-0002/);
    assert.match(text, /Next: harness adopt --write <engineer-github-login>\.\.\.; then move what you want to keep .*; then harness check\.\n$/);
    assert.deepEqual(snapshot(dir), before);
  });

  it('reports what check will say about the records that are there', () => {
    const dir = existing();
    write(dir, 'docs/decisions/D-0003-c.md', decision({ id: 'D-0003', status: 'Proposed' }));
    write(dir, 'docs/tasks/T-0002-b.md', task({ id: 'T-0002', status: 'Started' }));
    assert.deepEqual(inspect(dir).problems, [
      'docs/decisions/D-0003-c.md: status "Proposed" isn\'t Accepted/Replaced',
      "docs/decisions/index.md doesn't list D-0003-c.md",
      'docs/tasks/T-0002-b.md: status "Started" isn\'t Open/Doing/Done/Dropped',
    ]);
    assert.match(render(inspect(dir)), /What harness check will report about what is here\n {2}docs\/decisions\/D-0003-c\.md: status/);
  });

  it('--write adds what is missing and overwrites nothing', () => {
    const dir = existing();
    const before = new Map(snapshot(dir).map(([path, text]) => [path, text]));
    const { status, text } = captured(() => main(['--write', 'engineer-one'], dir));
    assert.equal(status, 0);
    assert.match(text, /^harness adopt --write added what was missing and overwrote nothing:\n {2}created \.harness\/engineers\n/);
    assert.doesNotMatch(text, /Would add/);
    const after = new Map(snapshot(dir).map(([path, text]) => [path, text]));
    for (const [path, was] of before) {
      if (path === 'package.json') continue;
      assert.equal(after.get(path), was, `${path} was changed`);
    }
    assert.deepEqual(JSON.parse(after.get('package.json')).scripts.prepare, 'harness hooks');
    for (const f of ['.harness/engineers', 'docs/lessons.md', 'CLAUDE.md', '.claude/agents/tester.md', 'docs/decisions/_template-decision.md', 'docs/tasks/_template.md', '.gitattributes'])
      assert.ok(existsSync(join(dir, f)), f);
    assert.match(after.get('.harness/engineers'), /\nengineer-one\n$/);

    // What is left is exactly the files that differ; check names them until sync has run.
    const report = inspect(dir);
    assert.deepEqual(paths(report.add), []);
    assert.deepEqual(paths(report.differs), ['.githooks/pre-push', 'docs/decisions/README.md', '.claude/settings.json', 'docs/tasks/index.md']);
    assert.deepEqual(runChecks(dir).flatMap((r) => r.problems), [
      'docs/tasks/index.md is out of step with the task files: run harness tasks-index',
      '.githooks/pre-push is missing or stale: run harness sync',
      'docs/decisions/README.md is missing or stale: run harness sync',
      '.claude/settings.json is missing or stale: run harness sync',
    ]);
    // A second run writes nothing.
    assert.match(captured(() => main(['--write', 'engineer-one'], dir)).text, /^harness adopt --write: nothing was missing, so nothing was written\./);
    sync(dir);
    assert.deepEqual(paths(inspect(dir).differs), ['docs/tasks/index.md']);
  });

  it('keeps a default branch the project already named', () => {
    const dir = existing();
    write(dir, '.harness/default-branch', 'trunk\n');
    const { text } = captured(() => main(['--write', '--default-branch', 'main'], dir));
    assert.match(text, /! kept \.harness\/default-branch, which names trunk, not main/);
    assert.equal(readFileSync(join(dir, '.harness/default-branch'), 'utf8'), 'trunk\n');
  });

  it('on an empty project it would add everything, and has no candidates', () => {
    const dir = tempProject();
    const report = inspect(dir);
    assert.deepEqual(report.kept, []);
    assert.deepEqual(report.differs, []);
    assert.equal(report.add.length, 19);
    assert.match(render(report), /docs\/decisions: not there yet\n {2}docs\/tasks: not there yet/);
    assert.match(render(report), /Candidates to replace with a global decision\n {2}none/);
  });

  it('refuses outside a project, in the harness itself and with an unknown option', () => {
    assert.equal(captured(() => main([], tempDir())).status, 1);
    const harness = tempDir();
    write(harness, 'package.json', JSON.stringify({ name: '@sandergeraedts/harness' }));
    assert.match(captured(() => main([], harness)).text, /this is the harness itself/);
    assert.match(captured(() => main(['--force'], tempProject())).text, /unknown option --force/);
  });
});
