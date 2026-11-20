import assert from 'node:assert/strict';
import { appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { main, runChecks } from '../lib/check.mjs';
import { init } from '../lib/init.mjs';
import { HARNESS_ROOT } from '../lib/paths.mjs';
import { writeIndex } from '../lib/tasks-index.mjs';
import { cleanUp, decision, indexOf, question, task, tempProject, write } from './helpers.mjs';

after(cleanUp);

const project = () => {
  const dir = tempProject();
  init(dir, { logins: ['engineer-one'] });
  return dir;
};
const problems = (dir) => runChecks(dir).flatMap((r) => r.problems);

describe('check', () => {
  it('passes on a freshly initialised project', () => {
    const dir = project();
    assert.deepEqual(problems(dir), []);
    assert.deepEqual(runChecks(dir).map((r) => r.name), ['tasks', 'decisions', 'engineers', 'generated files']);
    assert.equal(main([], dir), 0);
  });

  it('passes with tasks, decisions, a question and an overrule that are all in step', () => {
    const dir = project();
    write(dir, 'docs/tasks/T-0001-a.md', task());
    writeIndex(join(dir, 'docs/tasks'));
    write(dir, 'docs/decisions/D-0001-a.md', decision({ overrules: ['G-0017'] }));
    write(dir, 'docs/decisions/D-0002-b.md', decision({ id: 'D-0002', status: 'Replaced', replacedBy: ['D-0001'] }));
    write(dir, 'docs/decisions/Q-001-q.md', question({ status: 'Resolved', resolvedBy: ['D-0001'] }));
    write(dir, 'docs/decisions/index.md', indexOf(['D-0001-a.md', 'D-0002-b.md', 'Q-001-q.md']));
    assert.deepEqual(problems(dir), []);
  });

  it('fails when the task index is out of step', () => {
    const dir = project();
    write(dir, 'docs/tasks/T-0001-a.md', task());
    assert.deepEqual(problems(dir), ['docs/tasks/index.md is out of step with the task files: run harness tasks-index']);
    assert.equal(main([], dir), 1);
  });

  it('fails when the decision index misses a record or lists one that is gone', () => {
    const dir = project();
    write(dir, 'docs/decisions/D-0001-a.md', decision());
    assert.deepEqual(problems(dir), ["docs/decisions/index.md doesn't list D-0001-a.md"]);
    write(dir, 'docs/decisions/index.md', indexOf(['D-0001-a.md', 'D-0002-gone.md']));
    assert.deepEqual(problems(dir), ["docs/decisions/index.md lists D-0002-gone.md, which isn't a record"]);
  });

  it('fails on invalid front matter', () => {
    const dir = project();
    write(dir, 'docs/decisions/D-0001-a.md', decision({ status: 'Proposed' }));
    write(dir, 'docs/decisions/D-0002-b.md', decision({ id: 'D-0002', status: 'Replaced' }));
    write(dir, 'docs/decisions/D-0003-c.md', decision({ id: 'D-0004' }));
    write(dir, 'docs/decisions/Q-001-q.md', question({ status: 'Resolved' }));
    write(dir, 'docs/decisions/Q-002-r.md', 'no front matter\n');
    write(dir, 'docs/decisions/index.md', indexOf(['D-0001-a.md', 'D-0002-b.md', 'D-0003-c.md', 'Q-001-q.md', 'Q-002-r.md']));
    assert.deepEqual(problems(dir), [
      'docs/decisions/D-0001-a.md: status "Proposed" isn\'t Accepted/Replaced',
      'docs/decisions/D-0002-b.md: Replaced but replaced_by is empty',
      "docs/decisions/D-0003-c.md: id D-0004 doesn't match the file name",
      'docs/decisions/Q-001-q.md: Resolved but resolved_by is empty',
      'docs/decisions/Q-002-r.md: no front matter',
    ]);
  });

  it('fails when an overrule names a global decision that does not exist', () => {
    const dir = project();
    write(dir, 'docs/decisions/D-0001-a.md', decision({ overrules: ['G-9999', 'D-0002'] }));
    write(dir, 'docs/decisions/index.md', indexOf(['D-0001-a.md']));
    assert.deepEqual(problems(dir), [
      "docs/decisions/D-0001-a.md: overrules names G-9999, which isn't in the installed harness's global registry",
      "docs/decisions/D-0001-a.md: overrules names D-0002, which isn't a global decision id (G-NNNN)",
    ]);
  });

  it('fails when a generated file is stale or missing, and when nobody is an Engineer', () => {
    const dir = project();
    appendFileSync(join(dir, '.claude/agents/tester.md'), '\nA local edit.\n');
    rmSync(join(dir, '.githooks/pre-push'));
    write(dir, '.harness/engineers', '# nobody yet\n');
    assert.deepEqual(problems(dir), [
      ".harness/engineers lists nobody: add the Engineers' GitHub logins, one per line",
      '.claude/agents/tester.md is missing or stale: run harness sync',
      '.githooks/pre-push is missing or stale: run harness sync',
    ]);
  });

  it('passes on the harness itself: tasks, global registry, agents', () => {
    const results = runChecks(HARNESS_ROOT);
    assert.deepEqual(results.flatMap((r) => r.problems), []);
    assert.deepEqual(results.map((r) => r.name), ['tasks', 'global decisions', 'agents']);
  });
});
