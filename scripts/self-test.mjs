#!/usr/bin/env node
// The self-test (G-0015): packs the harness as a project would receive it, installs it into
// a throwaway project, and runs its commands there.
//   pnpm run self-test [--keep] [--e2e]
//     --keep  leaves the throwaway project behind
//     --e2e   also runs the created project's end-to-end tests (installs a browser)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const own = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'harness-self-test-'));
const project = join(work, 'throwaway');
const installed = join(project, 'node_modules', '@sandergeraedts', 'harness');
mkdirSync(project);

let steps = 0;
const step = (name) => console.log(`${String(++steps).padStart(2)}. ${name}`);
// Through a shell, because pnpm is a script on some platforms.
const sh = (command, { cwd = project, env } = {}) => {
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const ok = (command, opts) => {
  const r = sh(command, opts);
  assert.equal(r.status, 0, `${command} failed (${r.status}):\n${r.out}`);
  return r.out;
};
const fails = (command, expected, opts) => {
  const r = sh(command, opts);
  assert.notEqual(r.status, 0, `${command} should have failed:\n${r.out}`);
  assert.match(r.out, expected, command);
  return r;
};
const harness = 'pnpm exec harness';
const put = (rel, content) => {
  mkdirSync(dirname(join(project, rel)), { recursive: true });
  writeFileSync(join(project, rel), content);
};
const get = (rel) => readFileSync(join(project, rel), 'utf8');

try {
  step('pack the harness');
  ok(`pnpm pack --pack-destination "${work}"`, { cwd: root });
  const tarball = readdirSync(work).find((f) => f.endsWith('.tgz'));
  assert.ok(tarball, 'no tarball was packed');

  step('create a throwaway project and install the harness into it');
  ok('git init -q -b main');
  put('package.json', `${JSON.stringify({ name: 'throwaway', private: true, version: '0.0.0', type: 'module', packageManager: own.packageManager }, null, 2)}\n`);
  ok(`pnpm add -D "${join(work, tarball)}"`);
  for (const f of ['rules/AGENTS.md', 'decisions/index.md', 'decisions/README.md', 'agents/tester.md', 'templates/task.md', 'hooks/pre-push', 'bin/harness.mjs'])
    assert.ok(existsSync(join(installed, f)), `the package lacks ${f}`);
  for (const f of ['test', 'scripts', 'docs', '.github', '.claude'])
    assert.ok(!existsSync(join(installed, f)), `the package should not carry ${f}`);
  assert.equal(ok(`${harness} --version`).trim(), own.version);

  step('harness init');
  ok(`${harness} init engineer-one`);
  for (const f of [
    'AGENTS.md', 'CLAUDE.md', '.harness/engineers', 'docs/lessons.md', 'docs/decisions/index.md', 'docs/decisions/README.md',
    'docs/decisions/_template-decision.md', 'docs/decisions/_template-question.md', 'docs/tasks/_template.md', 'docs/tasks/index.md',
    '.claude/agents/architect.md', '.claude/agents/ux-designer.md', '.claude/agents/developer.md', '.claude/agents/tester.md',
    '.claude/settings.json', '.githooks/pre-push',
  ])
    assert.ok(existsSync(join(project, f)), `init did not create ${f}`);
  assert.match(get('.harness/engineers'), /^engineer-one$/m);
  assert.equal(ok('git config core.hooksPath').trim(), '.githooks');
  assert.ok(JSON.parse(get('.claude/settings.json')).permissions.deny.includes('Bash(git push origin main)'));
  assert.equal(JSON.parse(get('package.json')).scripts.prepare, 'harness hooks');

  step('harness sync is idempotent, and harness check passes');
  assert.match(ok(`${harness} sync`), /generated files are current/);
  const check = ok(`${harness} check`);
  for (const line of [/✓ tasks: 0 tasks, index in step/, /✓ decisions: 0 records/, /✓ engineers: 1 listed/, /✓ generated files: current/]) assert.match(check, line);

  step('the install scripts init added still let pnpm install');
  ok('pnpm install');

  step('a task, a decision that overrules a global one, and an open question');
  put(
    'docs/tasks/T-0001-show-a-greeting.md',
    get('docs/tasks/_template.md')
      .replace('id: T-NNNN', 'id: T-0001')
      .replace('"What the task delivers, as an imperative"', '"Show a greeting"')
      .replace('raised_on: YYYY-MM-DD', 'raised_on: 2026-01-02'),
  );
  fails(`${harness} tasks-index --check`, /index\.md is out of step/);
  fails(`${harness} check`, /✗ tasks: docs\/tasks\/index\.md is out of step/);
  ok(`${harness} tasks-index`);
  assert.match(ok(`${harness} tasks-index --check`), /✓ 1 tasks, index in step/);
  assert.match(get('docs/tasks/index.md'), /## Open\n\n- \[T-0001 Show a greeting\]\(T-0001-show-a-greeting\.md\)/);

  put(
    'docs/decisions/D-0001-plain-css-instead-of-a-framework.md',
    get('docs/decisions/_template-decision.md')
      .replace('id: D-NNNN', 'id: D-0001')
      .replace('"The decision, as a statement"', '"Plain CSS instead of a framework"')
      .replace('date: YYYY-MM-DD', 'date: 2026-01-02')
      .replace(/overrules: \[\]/, 'overrules: [G-0017]'),
  );
  put(
    'docs/decisions/Q-001-which-colours.md',
    get('docs/decisions/_template-question.md')
      .replace('id: Q-NNN', 'id: Q-001')
      .replace('"The question, as a question"', '"Which colours?"')
      .replace('raised_on: YYYY-MM-DD', 'raised_on: 2026-01-02'),
  );
  fails(`${harness} check`, /index\.md doesn't list D-0001-plain-css-instead-of-a-framework\.md/);
  appendFileSync(
    join(project, 'docs/decisions/index.md'),
    '\n- [D-0001 Plain CSS instead of a framework](D-0001-plain-css-instead-of-a-framework.md): no framework.\n- [Q-001 Which colours?](Q-001-which-colours.md): the palette.\n',
  );
  assert.match(ok(`${harness} check`), /✓ decisions: 2 records, index complete, 1 overrule valid/);

  step('harness overrules');
  const overrules = ok(`${harness} overrules`);
  assert.match(overrules, /^G-0017 ".*React.*"\n {2}overruled by D-0001 "Plain CSS instead of a framework" \(docs\/decisions\/D-0001-plain-css-instead-of-a-framework\.md\)/m);

  step('harness check catches an overrule of a decision that does not exist, and a stale generated file');
  const decisionFile = 'docs/decisions/D-0001-plain-css-instead-of-a-framework.md';
  const good = get(decisionFile);
  put(decisionFile, good.replace('[G-0017]', '[G-9999]'));
  fails(`${harness} check`, /overrules names G-9999, which isn't in the installed harness's global registry/);
  put(decisionFile, good);
  appendFileSync(join(project, '.claude/agents/tester.md'), '\nA local edit.\n');
  fails(`${harness} check`, /\.claude\/agents\/tester\.md is missing or stale: run harness sync/);
  assert.match(ok(`${harness} sync`), /wrote \.claude\/agents\/tester\.md/);
  ok(`${harness} check`);

  step('harness role');
  assert.equal(ok(`${harness} role`).trim(), 'requester', 'an account that is not listed is a Requester');
  // With nothing on the PATH there is no gh; run the bin directly, since pnpm is gone too.
  const bare = spawnSync(process.execPath, [join(installed, 'bin', 'harness.mjs'), 'role'], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, PATH: '', Path: '' },
  });
  assert.equal(bare.stdout.trim(), 'requester', `no gh means Requester: ${bare.stderr}`);
  const login = sh('gh api user --jq .login');
  if (login.status === 0 && login.out.trim()) {
    appendFileSync(join(project, '.harness/engineers'), `${login.out.trim()}\n`);
    assert.equal(ok(`${harness} role`).trim(), 'engineer', 'a listed account is an Engineer');
    console.log('    gh is signed in: checked engineer as well');
  } else console.log('    gh is not signed in here: engineer is covered by the unit tests only');
  const saved = get('.harness/engineers');
  rmSync(join(project, '.harness/engineers'));
  assert.equal(ok(`${harness} role`).trim(), 'requester', 'no engineers file means Requester');
  put('.harness/engineers', saved);

  step('harness changes');
  assert.match(ok(`${harness} changes v0.0.0 v${own.version}`), /## Added\n\n- G-0001 /);
  assert.match(ok(`${harness} changes v${own.version}`), /^No global decisions were added, changed or replaced/);
  fails(`${harness} changes v${own.version} v999.0.0`, /newer than the installed harness/);

  step('harness waiting');
  const waiting = ok(`${harness} waiting . .`);
  assert.equal(waiting.match(/Q-001 Which colours\? \(docs\/decisions\/Q-001-which-colours\.md\)/g)?.length, 2);
  assert.match(waiting, /Tasks with remaining checks\n {4}none/);

  step('harness protect builds the ruleset (dry run)');
  const ruleset = JSON.parse(ok(`${harness} protect "checks / checks" --dry-run`));
  assert.deepEqual(ruleset.bypass_actors, []);
  assert.deepEqual(ruleset.rules.map((r) => r.type), ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']);
  assert.deepEqual(ruleset.rules[3].parameters.required_status_checks, [{ context: 'checks / checks', integration_id: 15368 }]);

  step('harness nas refuses a destructive call, and gets to the connection otherwise');
  const nasEnv = { TRUENAS_HOST: 'localhost:9', TRUENAS_API_KEY: '', TRUENAS_CERT_SHA256: '' };
  const refused = fails(`${harness} nas pool.dataset.delete`, /is destructive \(G-0022\): ask the Engineer/, { env: nasEnv });
  assert.equal(refused.status, 2);
  fails(`${harness} nas pool.snapshot.create`, /Can't reach wss:\/\/localhost:9/, { env: nasEnv });

  step('the pre-push hook refuses the default branch and lets a feature branch through');
  const hook = (ref) => sh(`printf 'refs/heads/x 1 ${ref} 0\\n' | sh .githooks/pre-push`);
  assert.notEqual(hook('refs/heads/main').status, 0);
  assert.equal(hook('refs/heads/feature').status, 0);

  step('harness create refuses anyone who is not the Engineer');
  // Outside a project and without --engineer nobody is the Engineer, signed in or not.
  const bin = `"${process.execPath}" "${join(installed, 'bin', 'harness.mjs')}"`;
  fails(`${bin} create spun-up --purpose "Try the template." --no-github`, /only the Engineer creates a project \(G-0024\)/, { cwd: work });
  assert.ok(!existsSync(join(work, 'spun-up')), 'a refused create must write nothing');
  assert.match(ok(`${harness} create --help`), /--harness-ref <ref>/);

  step('harness create --no-github makes a project from the template');
  // The installed copy, told who is signed in: CI has no gh account to be the Engineer.
  const created = join(work, 'spun-up');
  const createArgs = ['spun-up', '--purpose', 'Try the template.', '--engineer', 'engineer-one', '--accent', '#aa3366', '--language', 'nl', '--no-github', '--harness-package', join(work, tarball)];
  writeFileSync(
    join(work, 'create.mjs'),
    `import { main } from ${JSON.stringify(pathToFileURL(join(installed, 'lib', 'create.mjs')).href)};\nprocess.exitCode = await main(${JSON.stringify(createArgs)}, process.cwd(), { getLogin: () => 'engineer-one', interactive: false });\n`,
  );
  const identity = { GIT_AUTHOR_NAME: 'Self-test', GIT_AUTHOR_EMAIL: 'self-test@example.invalid', GIT_COMMITTER_NAME: 'Self-test', GIT_COMMITTER_EMAIL: 'self-test@example.invalid' };
  const createOut = ok(`"${process.execPath}" create.mjs`, { cwd: work, env: identity });
  for (const line of [/✓ tasks: 3 tasks, index in step/, /✓ decisions: 5 records, index complete/, /✓ engineers: 1 listed/, /✓ generated files: current/, /✓ first commit on main/, /Stopped before GitHub/])
    assert.match(createOut, line);
  const inCreated = { cwd: created };
  assert.equal(ok('git rev-list --count HEAD', inCreated).trim(), '1');
  assert.equal(ok('git status --porcelain', inCreated).trim(), '', 'everything is in the first commit');
  assert.equal(ok('git branch --show-current', inCreated).trim(), 'main');
  assert.match(ok('git ls-files -s .githooks/pre-push', inCreated), /^100755 /);
  const made = (rel) => readFileSync(join(created, rel), 'utf8');
  assert.match(made('.harness/engineers'), /^engineer-one$/m);
  for (const wf of ['ci.yml', 'auto-merge.yml']) assert.ok(made(`.github/workflows/${wf}`).includes(`/.github/workflows/${wf}@v${own.version}\n`), `${wf} is pinned to the tag`);
  assert.match(made('AGENTS.md'), /^\*\*Spun up\.\*\* Try the template\.$/m);
  assert.match(made('docs/tasks/index.md'), /T-0003 Translate the interface/);
  assert.doesNotMatch(made('src/styles/app.css') + made('package.json') + made('index.html'), /__[A-Z]+(_[A-Z]+)*__/);
  for (const f of ['public/icons/icon-192.png', 'public/icons/icon.svg', 'pnpm-lock.yaml', '.gitignore']) assert.ok(existsSync(join(created, f)), `create did not make ${f}`);

  step('the created project installs, type-checks, passes its tests, builds and passes harness check');
  ok('pnpm install --frozen-lockfile', inCreated);
  ok('pnpm run typecheck', inCreated);
  assert.match(ok('pnpm test', inCreated), /Tests\s+\d+ passed/);
  ok('pnpm run build', inCreated);
  assert.ok(existsSync(join(created, 'dist', 'sw.js')), 'the build has a service worker');
  assert.match(ok(`${harness} check`, inCreated), /✓ generated files: current/);

  if (process.argv.includes('--e2e')) {
    step('the created project passes its end-to-end tests');
    ok(`pnpm exec playwright install ${process.env.CI ? '--with-deps ' : ''}chromium`, inCreated);
    const e2e = ok('pnpm run test:e2e', { ...inCreated, env: { E2E_PORT: '4317' } });
    assert.match(e2e, /\d+ passed/);
    assert.doesNotMatch(e2e, /\d+ (failed|flaky)/);
  }

  console.log(`\n✓ self-test passed: ${steps} steps, harness ${own.version} in a throwaway project`);
} catch (e) {
  console.error(`\n✗ self-test failed at step ${steps}: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (process.argv.includes('--keep')) console.log(`kept ${project}`);
  else rmSync(work, { recursive: true, force: true, maxRetries: 3 });
}
