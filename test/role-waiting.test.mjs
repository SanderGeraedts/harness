import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { readEngineers, resolveRole } from '../lib/role.mjs';
import { findWaiting, renderWaiting } from '../lib/waiting.mjs';
import { cleanUp, decision, question, task, tempDir, write } from './helpers.mjs';

after(cleanUp);

describe('role', () => {
  const project = (engineers) => {
    const dir = tempDir();
    if (engineers !== undefined) write(dir, '.harness/engineers', engineers);
    return dir;
  };

  it('is engineer when the signed-in login is listed, whatever its case', () => {
    const dir = project('# the Engineers\nengineer-one\n@Engineer-Two  # second\n\n');
    assert.deepEqual(readEngineers(dir), ['engineer-one', 'Engineer-Two']);
    assert.equal(resolveRole(dir, () => 'engineer-one'), 'engineer');
    assert.equal(resolveRole(dir, () => 'ENGINEER-TWO'), 'engineer');
  });

  it('is requester for anyone else', () => {
    const dir = project('engineer-one\n');
    assert.equal(resolveRole(dir, () => 'someone-else'), 'requester');
    assert.equal(resolveRole(dir, () => 'engineer'), 'requester');
  });

  it('is requester when gh is missing or not signed in', () => {
    assert.equal(resolveRole(project('engineer-one\n'), () => undefined), 'requester');
  });

  it('is requester when the file is missing or lists nobody, without asking gh', () => {
    const never = () => assert.fail('gh was asked');
    assert.equal(resolveRole(project(undefined), never), 'requester');
    assert.equal(resolveRole(project('# nobody\n'), never), 'requester');
  });
});

describe('waiting', () => {
  const project = () => {
    const dir = tempDir();
    write(dir, '.harness/engineers', 'engineer-one\n');
    write(dir, 'docs/decisions/Q-001-a.md', question({ title: 'Which host?' }));
    write(dir, 'docs/decisions/Q-002-b.md', question({ id: 'Q-002', status: 'Resolved', resolvedBy: ['D-0001'] }));
    write(dir, 'docs/decisions/D-0001-a.md', decision());
    write(dir, 'docs/tasks/T-0001-a.md', task({ title: 'Ship it', status: 'Doing', log: '- 2026-01-03 developer: built.\n- 2026-01-04 tester: passed. Remaining: the Requester\n  looks at it on a phone.\n' }));
    write(dir, 'docs/tasks/T-0002-b.md', task({ id: 'T-0002', status: 'Doing', log: '- 2026-01-03 developer: Remaining: a look.\n- 2026-01-05 tester: confirmed.\n' }));
    write(dir, 'docs/tasks/T-0003-c.md', task({ id: 'T-0003', status: 'Done', doneOn: '2026-01-05', log: '- 2026-01-05 tester: Remaining: nothing really.\n' }));
    return dir;
  };
  const issues = () => [
    { number: 7, title: 'Answer Q-001', url: 'https://example.test/7', assignees: [{ login: 'Engineer-One' }] },
    { number: 8, title: 'Unassigned', url: 'https://example.test/8', assignees: [] },
    { number: 9, title: 'Pick a colour', url: 'https://example.test/9', assignees: [{ login: 'someone-else' }] },
  ];

  it('finds open questions, the last Remaining line of open tasks, and assigned issues', () => {
    const w = findWaiting(project(), issues);
    assert.deepEqual(w.questions, [{ id: 'Q-001', title: 'Which host?', file: 'docs/decisions/Q-001-a.md' }]);
    assert.deepEqual(w.remaining, [{ id: 'T-0001', title: 'Ship it', remaining: 'the Requester looks at it on a phone.' }]);
    assert.deepEqual(w.issues.map((i) => [i.number, i.assignees]), [
      [7, [{ login: 'Engineer-One', engineer: true }]],
      [9, [{ login: 'someone-else', engineer: false }]],
    ]);
    const text = renderWaiting('a-project', w);
    assert.match(text, /^a-project\n {2}Open questions \(wait for the Engineer\)\n {4}Q-001 Which host\? \(docs\/decisions\/Q-001-a\.md\)\n/);
    assert.match(text, /T-0001 Ship it: the Requester looks at it on a phone\./);
    assert.match(text, /#7 Answer Q-001 → @Engineer-One \(Engineer\) https:\/\/example\.test\/7/);
    assert.match(text, /#9 Pick a colour → @someone-else https/);
  });

  it('still lists the rest when gh is absent', () => {
    const w = findWaiting(project(), () => undefined);
    assert.equal(w.issuesAvailable, false);
    assert.equal(w.questions.length, 1);
    assert.match(renderWaiting('a-project', w), /Assigned issues\n {4}skipped: gh is missing/);
  });

  it('says none for a folder with nothing waiting', () => {
    const text = renderWaiting('empty', findWaiting(tempDir(), () => []));
    assert.equal(text, 'empty\n  Open questions (wait for the Engineer)\n    none\n  Tasks with remaining checks\n    none\n  Assigned issues\n    none\n');
  });
});
