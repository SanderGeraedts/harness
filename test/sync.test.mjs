import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { init } from '../lib/init.mjs';
import { HARNESS_ROOT } from '../lib/paths.mjs';
import { generatedFiles, mergeSettings, requiredSettings, staleFiles, sync } from '../lib/sync.mjs';
import { cleanUp, tempProject, write } from './helpers.mjs';

after(cleanUp);

const readJson = (dir, rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
const mtimes = (dir, files) => files.map((f) => statSync(join(dir, f)).mtimeMs);
const GENERATED = [
  '.claude/agents/architect.md',
  '.claude/agents/developer.md',
  '.claude/agents/tester.md',
  '.claude/agents/ux-designer.md',
  '.githooks/pre-push',
  'docs/decisions/README.md',
  'docs/decisions/_template-decision.md',
  'docs/decisions/_template-question.md',
  'docs/tasks/_template.md',
  '.claude/settings.json',
];

describe('sync', () => {
  it('writes every generated file once, and nothing the second time', () => {
    const dir = tempProject();
    assert.deepEqual(staleFiles(dir), GENERATED);
    assert.deepEqual(sync(dir), GENERATED);
    const before = mtimes(dir, GENERATED);
    const content = GENERATED.map((f) => readFileSync(join(dir, f), 'utf8'));
    assert.deepEqual(staleFiles(dir), []);
    assert.deepEqual(sync(dir), []);
    assert.deepEqual(mtimes(dir, GENERATED), before);
    assert.deepEqual(GENERATED.map((f) => readFileSync(join(dir, f), 'utf8')), content);
  });

  it('refreshes a file that was edited or removed, and only that one', () => {
    const dir = tempProject();
    sync(dir);
    write(dir, '.claude/agents/tester.md', 'edited\n');
    assert.deepEqual(staleFiles(dir), ['.claude/agents/tester.md']);
    assert.deepEqual(sync(dir), ['.claude/agents/tester.md']);
    assert.equal(readFileSync(join(dir, '.claude/agents/tester.md'), 'utf8'), readFileSync(join(HARNESS_ROOT, 'agents/tester.md'), 'utf8').replace(/\r\n/g, '\n'));
  });

  it("leaves the project's own agents and files alone", () => {
    const dir = tempProject();
    write(dir, '.claude/agents/own.md', 'mine\n');
    sync(dir);
    assert.equal(readFileSync(join(dir, '.claude/agents/own.md'), 'utf8'), 'mine\n');
  });

  it("merges the rules into the project's settings without dropping its own", () => {
    const dir = tempProject();
    const own = {
      model: 'something',
      permissions: { allow: ['Bash(pnpm test)'], deny: ['Bash(rm -rf:*)', 'Bash(git push origin main)'], ask: ['Bash(deploy:*)'] },
      hooks: { Stop: [] },
    };
    write(dir, '.claude/settings.json', JSON.stringify(own));
    sync(dir);
    const merged = readJson(dir, '.claude/settings.json');
    const required = requiredSettings('main');
    assert.equal(merged.model, 'something');
    assert.deepEqual(merged.hooks, { Stop: [] });
    assert.deepEqual(merged.permissions.allow, ['Bash(pnpm test)']);
    assert.deepEqual(merged.permissions.deny.slice(0, 2), ['Bash(rm -rf:*)', 'Bash(git push origin main)']);
    for (const rule of required.deny) assert.ok(merged.permissions.deny.includes(rule), rule);
    assert.equal(merged.permissions.deny.length, required.deny.length + 1);
    assert.deepEqual(merged.permissions.ask, ['Bash(deploy:*)', 'Bash(*--confirmed*)', 'PowerShell(*--confirmed*)']);
    assert.deepEqual(sync(dir), []);
  });

  it("doesn't rewrite settings that already hold every rule, however they are formatted", () => {
    const dir = tempProject();
    const text = JSON.stringify(mergeSettings({ permissions: { allow: ['x'] } }, requiredSettings('main')), null, 8);
    write(dir, '.claude/settings.json', text);
    sync(dir);
    assert.equal(readFileSync(join(dir, '.claude/settings.json'), 'utf8'), text);
  });

  it('refuses to guess when the settings are not valid JSON', () => {
    const dir = tempProject();
    write(dir, '.claude/settings.json', '{ not json');
    assert.throws(() => sync(dir), /isn't valid JSON/);
  });

  it('guards the default branch the project names', () => {
    const dir = tempProject();
    write(dir, '.harness/default-branch', 'trunk\n');
    sync(dir);
    const hook = readFileSync(join(dir, '.githooks/pre-push'), 'utf8');
    assert.match(hook, /refs\/heads\/trunk"/);
    assert.doesNotMatch(hook, /__DEFAULT_BRANCH__|\r/);
    assert.ok(readJson(dir, '.claude/settings.json').permissions.deny.includes('Bash(git push origin HEAD:trunk)'));
  });

  it("the harness's own hook and settings are what sync would write", () => {
    const hook = generatedFiles(tempProject()).find((f) => f.path === '.githooks/pre-push').content;
    assert.equal(readFileSync(join(HARNESS_ROOT, '.githooks/pre-push'), 'utf8').replace(/\r\n/g, '\n'), hook);
    const own = readJson(HARNESS_ROOT, '.claude/settings.json');
    assert.deepEqual(mergeSettings(own, requiredSettings('main')), own);
  });
});

describe('init', () => {
  it('creates the registries, the Engineers, the lessons and the thin agent files, then syncs', () => {
    const dir = tempProject();
    init(dir, { logins: ['engineer-one', '@engineer-two'] });
    for (const f of [...GENERATED, 'AGENTS.md', 'CLAUDE.md', 'docs/lessons.md', 'docs/decisions/index.md', 'docs/tasks/index.md', '.harness/engineers', '.nvmrc', '.gitattributes'])
      assert.ok(existsSync(join(dir, f)), f);
    assert.match(readFileSync(join(dir, '.harness/engineers'), 'utf8'), /\nengineer-one\nengineer-two\n$/);
    assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /node_modules\/@sandergeraedts\/harness\/rules\/AGENTS\.md/);
    assert.match(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), /^@node_modules\/@sandergeraedts\/harness\/rules\/AGENTS\.md$/m);
    const pkg = readJson(dir, 'package.json');
    assert.equal(pkg.scripts.prepare, 'harness hooks');
    assert.match(pkg.scripts.preinstall, /pnpm/);
    assert.deepEqual(staleFiles(dir), []);
  });

  it('never overwrites what the project already has, and adds only new Engineers', () => {
    const dir = tempProject();
    write(dir, 'AGENTS.md', 'ours\n');
    write(dir, 'docs/lessons.md', 'a lesson\n');
    write(dir, 'package.json', JSON.stringify({ name: 'throwaway', scripts: { prepare: 'our-own' } }));
    write(dir, '.gitattributes', '* text=auto');
    init(dir, { logins: ['engineer-one'] });
    init(dir, { logins: ['Engineer-One', 'engineer-two'] });
    assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), 'ours\n');
    assert.equal(readFileSync(join(dir, 'docs/lessons.md'), 'utf8'), 'a lesson\n');
    assert.equal(readJson(dir, 'package.json').scripts.prepare, 'our-own');
    assert.equal(readFileSync(join(dir, '.gitattributes'), 'utf8'), '* text=auto\n.githooks/* text eol=lf\n');
    assert.match(readFileSync(join(dir, '.harness/engineers'), 'utf8'), /\nengineer-one\nengineer-two\n$/);
  });
});
