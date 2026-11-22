import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { parse } from '../lib/frontmatter.mjs';
import { HARNESS_ROOT } from '../lib/paths.mjs';
import { checkTasks, logEntries, main, readTasks, renderIndex, writeIndex } from '../lib/tasks-index.mjs';
import { cleanUp, task, tempDir, write } from './helpers.mjs';

after(cleanUp);

describe('front matter', () => {
  it('reads strings, bare words, comments and lists', () => {
    const { fields } = parse('---\nid: T-0001\ntitle: "A: title, with # and \\"quotes\\""  # note\nstatus: Open   # Open | Done\ndone_on: ""\nlist: [G-0001, D-0002]\nempty: []\n---\nbody');
    assert.equal(fields.id, 'T-0001');
    assert.equal(fields.title, 'A: title, with # and "quotes"');
    assert.equal(fields.status, 'Open');
    assert.equal(fields.done_on, '');
    assert.deepEqual(fields.list, ['G-0001', 'D-0002']);
    assert.deepEqual(fields.empty, []);
  });
});

describe('tasks-index', () => {
  it('groups tasks by status and says None for an empty one', () => {
    const dir = tempDir();
    write(dir, 'T-0001-a.md', task({ id: 'T-0001', title: 'First', status: 'Done', doneOn: '2026-01-03', log: '- 2026-01-03 tester: passed\n' }));
    write(dir, 'T-0002-b.md', task({ id: 'T-0002', title: 'Second' }));
    write(dir, '_template.md', task({ id: 'T-NNNN' }));
    const { tasks, problems } = readTasks(dir);
    assert.deepEqual(problems, []);
    assert.deepEqual(tasks.map((t) => t.id), ['T-0001', 'T-0002']);
    const index = renderIndex(tasks);
    assert.match(index, /## Open\n\n- \[T-0002 Second\]\(T-0002-b\.md\): One sentence about second\.\n/);
    assert.match(index, /## Doing\n\nNone\.\n/);
    assert.match(index, /## Done\n\n- \[T-0001 First\]/);
  });

  it('reports a task whose front matter and Log disagree', () => {
    const dir = tempDir();
    write(dir, 'T-0001-a.md', task({ id: 'T-0001', status: 'Done' }));
    write(dir, 'T-0002-b.md', task({ id: 'T-0002', status: 'Open', doneOn: '2026-01-03' }));
    write(dir, 'T-0003-c.md', task({ id: 'T-0003', status: 'Doing' }));
    write(dir, 'T-0004-d.md', task({ id: 'T-0004', status: 'Finished' }));
    write(dir, 'T-0005-e.md', task({ id: 'T-0009' }));
    const { problems } = readTasks(dir);
    assert.deepEqual(problems, [
      'T-0001-a.md: Done but done_on is empty',
      'T-0001-a.md: Done but the Log is empty',
      'T-0002-b.md: done_on is set but status is Open',
      'T-0003-c.md: Doing but the Log is empty',
      'T-0004-d.md: status "Finished" isn\'t Open/Doing/Done/Dropped',
      "T-0005-e.md: id T-0009 doesn't match the file name",
    ]);
  });

  it('joins a Log entry with its continuation lines', () => {
    assert.deepEqual(logEntries('# Log\n\nOne line each.\n- 2026-01-03 developer: built it.\n  Remaining: a look on a phone.\n- next\n'), [
      '2026-01-03 developer: built it. Remaining: a look on a phone.',
      'next',
    ]);
  });

  it('--check fails until the index is regenerated', () => {
    const dir = tempDir();
    write(dir, 'docs/tasks/T-0001-a.md', task());
    const tasksDir = join(dir, 'docs/tasks');
    assert.match(checkTasks(tasksDir, 'docs/tasks').problems[0], /index\.md is out of step/);
    assert.equal(main([], dir), 0);
    assert.deepEqual(checkTasks(tasksDir).problems, []);
    assert.equal(main(['--check'], dir), 0);
    write(dir, 'docs/tasks/T-0001-a.md', task({ status: 'Doing', log: '- 2026-01-03 developer: started\n' }));
    assert.equal(main(['--check'], dir), 1);
    writeIndex(tasksDir);
    assert.equal(main(['--check'], dir), 0);
  });

  it("reads a task's size: small or full, and full when it has none (G-0031)", () => {
    const dir = tempDir();
    write(dir, 'T-0001-a.md', task({ id: 'T-0001', title: 'Small', size: 'small' }));
    write(dir, 'T-0002-b.md', task({ id: 'T-0002', title: 'Full', size: 'full' }));
    write(dir, 'T-0003-c.md', task({ id: 'T-0003', title: 'Older' }));
    write(dir, 'T-0004-d.md', task({ id: 'T-0004', title: 'Empty', size: '""' }));
    const { tasks, problems } = readTasks(dir);
    assert.deepEqual(problems, []);
    assert.deepEqual(tasks.map((t) => t.size), ['small', 'full', 'full', 'full']);
    const index = renderIndex(tasks);
    assert.match(index, /^- \[T-0001 Small\]\(T-0001-a\.md\) \(small\): /m);
    assert.match(index, /^- \[T-0002 Full\]\(T-0002-b\.md\): /m);
    assert.match(index, /^- \[T-0003 Older\]\(T-0003-c\.md\): /m);
  });

  it('refuses a size it does not know, in --check and when writing the index', () => {
    const dir = tempDir();
    write(dir, 'docs/tasks/T-0001-a.md', task({ size: 'medium' }));
    assert.deepEqual(readTasks(join(dir, 'docs/tasks')).problems, ['T-0001-a.md: size "medium" isn\'t small/full']);
    assert.equal(main([], dir), 1);
    assert.equal(existsSync(join(dir, 'docs/tasks/index.md')), false, 'nothing is written');
    assert.equal(main(['--check'], dir), 1);
    write(dir, 'docs/tasks/T-0001-a.md', task({ size: 'small' }));
    assert.equal(main([], dir), 0);
    assert.equal(main(['--check'], dir), 0);
  });

  it('the task template has a size, full by default', () => {
    const { fields } = parse(readFileSync(join(HARNESS_ROOT, 'templates/task.md'), 'utf8'));
    assert.equal(fields.size, 'full');
  });

  it('takes another directory', () => {
    const dir = tempDir();
    write(dir, 'work/T-0001-a.md', task());
    assert.equal(main(['work'], dir), 0);
    assert.match(readFileSync(join(dir, 'work/index.md'), 'utf8'), /T-0001 Do the thing/);
    assert.equal(main(['--check', 'missing'], dir), 1);
  });

  it("the harness's own task index is in step", () => {
    assert.deepEqual(checkTasks(join(HARNESS_ROOT, 'docs/tasks'), 'docs/tasks').problems, []);
  });
});
