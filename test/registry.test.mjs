import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { findChanges, main as changesMain, renderChanges } from '../lib/changes.mjs';
import { findOverrules } from '../lib/overrules.mjs';
import { GLOBAL_DECISIONS_DIR, harnessVersion } from '../lib/paths.mjs';
import { checkRegistry, readRecords } from '../lib/registry.mjs';
import { cleanUp, decision, globalDecision, indexOf, tempDir, write } from './helpers.mjs';

after(cleanUp);

describe('overrules', () => {
  it('lists the Accepted project decisions that overrule a global one', () => {
    const dir = tempDir();
    const globals = tempDir();
    write(globals, 'G-0001-a.md', globalDecision({ id: 'G-0001', title: 'Use tabs' }));
    write(globals, 'G-0002-b.md', globalDecision({ id: 'G-0002', title: 'Use spaces' }));
    write(dir, 'docs/decisions/D-0001-a.md', decision({ title: 'Plain choice' }));
    write(dir, 'docs/decisions/D-0002-b.md', decision({ id: 'D-0002', title: 'Spaces here', overrules: ['G-0001', 'G-0002'] }));
    write(dir, 'docs/decisions/D-0003-c.md', decision({ id: 'D-0003', status: 'Replaced', replacedBy: ['D-0002'], overrules: ['G-0001'] }));
    assert.deepEqual(findOverrules(dir, globals), [
      { global: 'G-0001', globalTitle: 'Use tabs', globalStatus: 'Accepted', decision: 'D-0002', title: 'Spaces here', file: 'docs/decisions/D-0002-b.md' },
      { global: 'G-0002', globalTitle: 'Use spaces', globalStatus: 'Accepted', decision: 'D-0002', title: 'Spaces here', file: 'docs/decisions/D-0002-b.md' },
    ]);
  });

  it('is empty for a project without overrules', () => {
    const dir = tempDir();
    write(dir, 'docs/decisions/D-0001-a.md', decision());
    assert.deepEqual(findOverrules(dir), []);
  });
});

describe('a replaced_by that names a global decision', () => {
  const project = () => {
    const dir = tempDir();
    write(dir, 'D-0001-a.md', decision({ status: 'Replaced', replacedBy: ['G-0002'] }));
    write(dir, 'index.md', indexOf(['D-0001-a.md']));
    return dir;
  };

  it('is checked against the global ids, and only its form without them', () => {
    const dir = project();
    assert.deepEqual(checkRegistry(dir, 'project', { label: 'd', globalIds: new Set(['G-0002']) }).problems, []);
    assert.deepEqual(checkRegistry(dir, 'project', { label: 'd', globalIds: new Set(['G-0001']) }).problems, [
      "d/D-0001-a.md: replaced_by names G-0002, which isn't in the installed harness's global registry",
    ]);
    assert.deepEqual(checkRegistry(dir, 'project', { label: 'd' }).problems, []);
  });

  it('is not for the global registry itself', () => {
    const dir = tempDir();
    write(dir, 'G-0001-a.md', globalDecision({ id: 'G-0001', status: 'Replaced', changed: '0.2.0', replacedBy: ['G-0002'] }));
    write(dir, 'index.md', indexOf(['G-0001-a.md']));
    assert.deepEqual(checkRegistry(dir, 'global', { label: 'decisions' }).problems, ["decisions/G-0001-a.md: names G-0002, which doesn't exist"]);
  });
});

describe('changes', () => {
  const globals = () => {
    const dir = tempDir();
    write(dir, 'G-0001-a.md', globalDecision({ id: 'G-0001', title: 'Old and untouched' }));
    write(dir, 'G-0002-b.md', globalDecision({ id: 'G-0002', title: 'Replaced later', status: 'Replaced', changed: '0.2.0', replacedBy: ['G-0003'] }));
    write(dir, 'G-0003-c.md', globalDecision({ id: 'G-0003', title: 'The replacement', since: '0.2.0' }));
    write(dir, 'G-0004-d.md', globalDecision({ id: 'G-0004', title: 'Redacted', changed: '0.3.0' }));
    write(dir, 'G-0005-e.md', globalDecision({ id: 'G-0005', title: 'Newest', since: '0.3.0' }));
    return dir;
  };
  const ids = (c) => ({ added: c.added.map((r) => r.id), replaced: c.replaced.map((r) => r.id), changed: c.changed.map((r) => r.id) });

  it('lists what was added, replaced and changed after <from>, up to and including <to>', () => {
    const dir = globals();
    assert.deepEqual(ids(findChanges('v0.1.0', 'v0.2.0', dir)), { added: ['G-0003'], replaced: ['G-0002'], changed: [] });
    assert.deepEqual(ids(findChanges('0.2.0', '0.3.0', dir)), { added: ['G-0005'], replaced: [], changed: ['G-0004'] });
    assert.deepEqual(ids(findChanges('v0.1.0', 'v0.3.0', dir)), { added: ['G-0003', 'G-0005'], replaced: ['G-0002'], changed: ['G-0004'] });
    assert.deepEqual(ids(findChanges('v0.0.9', 'v0.1.0', dir)), { added: ['G-0001', 'G-0002', 'G-0004'], replaced: [], changed: [] });
    assert.deepEqual(ids(findChanges('v0.3.0', 'v0.3.0', dir)), { added: [], replaced: [], changed: [] });
  });

  it('renders the list for the update pull request', () => {
    const dir = globals();
    const text = renderChanges(findChanges('v0.1.0', 'v0.3.0', dir), 'v0.1.0', '0.3.0');
    assert.match(text, /^# Global decisions, v0\.1\.0 to v0\.3\.0\n/);
    assert.match(text, /## Added\n\n- G-0003 The replacement: .*\n- G-0005 Newest: /);
    assert.match(text, /## Replaced\n\n- G-0002 Replaced later \(replaced by G-0003\): /);
    assert.match(text, /## Changed\n\n- G-0004 Redacted: /);
    assert.equal(renderChanges(findChanges('v0.3.0', 'v0.3.0', dir), 'v0.3.0', 'v0.3.0'), 'No global decisions were added, changed or replaced between v0.3.0 and v0.3.0.\n');
  });

  it('refuses versions it cannot answer for', () => {
    assert.equal(changesMain([]), 1);
    assert.equal(changesMain(['one', 'two']), 1);
    assert.equal(changesMain(['v0.0.1', 'v999.0.0']), 1);
    assert.equal(changesMain([`v${harnessVersion()}`]), 0);
  });
});

describe('the global registry', () => {
  it('is valid, complete in its index, and every record is traceable', () => {
    const { records, problems } = checkRegistry(GLOBAL_DECISIONS_DIR, 'global', { label: 'decisions' });
    assert.deepEqual(problems, []);
    assert.ok(records.length >= 24);
    for (const r of records) assert.equal(r.fields.decided_by, 'engineer', r.file);
  });

  it('rejects a global record without since, and one that overrules', () => {
    const dir = tempDir();
    write(dir, 'G-0001-a.md', globalDecision({ id: 'G-0001', since: '' }));
    write(dir, 'G-0002-b.md', globalDecision({ id: 'G-0002', status: 'Replaced', replacedBy: ['G-0001'] }));
    write(dir, 'index.md', indexOf(['G-0001-a.md', 'G-0002-b.md']));
    assert.deepEqual(checkRegistry(dir, 'global', { label: 'decisions' }).problems, [
      "decisions/G-0001-a.md: since isn't a version like 0.1.0",
      'decisions/G-0002-b.md: Replaced but changed (the version it happened in) is empty',
    ]);
    assert.equal(readRecords(join(dir, 'nowhere'), 'global').length, 0);
  });
});
