import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { checkSkills, main, runChecks } from '../lib/check.mjs';
import { init } from '../lib/init.mjs';
import { HARNESS_ROOT } from '../lib/paths.mjs';
import { SECTION_END } from '../lib/sync.mjs';
import { writeIndex } from '../lib/tasks-index.mjs';
import { cleanUp, decision, indexOf, question, task, tempDir, tempProject, write } from './helpers.mjs';

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

  it('lets a project decision be replaced by a global decision of the installed harness', () => {
    const dir = project();
    write(dir, 'docs/decisions/D-0001-a.md', decision({ status: 'Replaced', replacedBy: ['G-0016'] }));
    write(dir, 'docs/decisions/D-0002-b.md', decision({ id: 'D-0002', status: 'Replaced', replacedBy: ['D-0003', 'G-0017'] }));
    write(dir, 'docs/decisions/D-0003-c.md', decision({ id: 'D-0003' }));
    write(dir, 'docs/decisions/index.md', indexOf(['D-0001-a.md', 'D-0002-b.md', 'D-0003-c.md']));
    assert.deepEqual(problems(dir), []);
  });

  it('fails when replaced_by names a global decision that does not exist, or replaces names one', () => {
    const dir = project();
    write(dir, 'docs/decisions/D-0001-a.md', decision({ status: 'Replaced', replacedBy: ['G-9999'] }));
    write(dir, 'docs/decisions/D-0002-b.md', decision({ id: 'D-0002', status: 'Replaced', replacedBy: ['D-0009'] }));
    write(dir, 'docs/decisions/D-0003-c.md', decision({ id: 'D-0003', replacedBy: ['G-0016'] }));
    write(dir, 'docs/decisions/D-0004-d.md', decision({ id: 'D-0004', extra: 'replaces: [G-0016]\n' }));
    write(dir, 'docs/decisions/index.md', indexOf(['D-0001-a.md', 'D-0002-b.md', 'D-0003-c.md', 'D-0004-d.md']));
    assert.deepEqual(problems(dir), [
      "docs/decisions/D-0001-a.md: replaced_by names G-9999, which isn't in the installed harness's global registry",
      "docs/decisions/D-0002-b.md: names D-0009, which doesn't exist",
      'docs/decisions/D-0003-c.md: replaced_by is set but status is Accepted',
      "docs/decisions/D-0004-d.md: names G-0016, which doesn't exist",
    ]);
  });

  it("ignores the registry README's project section, and reports damaged markers", () => {
    const dir = project();
    const path = join(dir, 'docs/decisions/README.md');
    const readme = readFileSync(path, 'utf8');
    writeFileSync(path, readme.replace('Nothing yet.', 'Decisions about the shop live in a second folder.'));
    assert.deepEqual(problems(dir), []);
    writeFileSync(path, readme.replace('## Records', '## Our records'));
    assert.deepEqual(problems(dir), ['docs/decisions/README.md is missing or stale: run harness sync']);
    writeFileSync(path, readme.replace(SECTION_END, ''));
    assert.match(problems(dir)[0], /^docs\/decisions\/README\.md: the project section's marker lines are damaged/);
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

  it('passes on the harness itself: tasks, global registry, agents, skills', () => {
    const results = runChecks(HARNESS_ROOT);
    assert.deepEqual(results.flatMap((r) => r.problems), []);
    assert.deepEqual(results.map((r) => r.name), ['tasks', 'global decisions', 'agents', 'skills']);
    assert.equal(results.at(-1).detail, '1 skill');
  });

  it('fails on a skill folder without SKILL.md, a name that differs from its folder, or no description', () => {
    const dir = tempDir();
    write(dir, 'good/SKILL.md', '---\nname: good\ndescription: Does a thing.\n---\n\nBody.\n');
    write(dir, 'empty/notes.md', 'nothing\n');
    write(dir, 'renamed/SKILL.md', '---\nname: other\ndescription: Does a thing.\n---\n');
    write(dir, 'silent/SKILL.md', '---\nname: silent\n---\n');
    write(dir, 'bare/SKILL.md', 'No front matter.\n');
    const { names, problems } = checkSkills(dir);
    assert.deepEqual(names, ['bare', 'good', 'renamed', 'silent']);
    assert.deepEqual(problems, [
      'skills/empty: no SKILL.md',
      'skills/bare/SKILL.md: no name in its front matter',
      'skills/bare/SKILL.md: no description',
      `skills/renamed/SKILL.md: name "other" doesn't match the folder`,
      'skills/silent/SKILL.md: no description',
    ]);
    assert.deepEqual(checkSkills(join(dir, 'none')), { names: [], problems: [] });
  });
});
