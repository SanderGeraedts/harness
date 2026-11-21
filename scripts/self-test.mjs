#!/usr/bin/env node
// The self-test (G-0015): packs the harness as a project would receive it, installs it into
// a throwaway project, and runs its commands there.
//   pnpm run self-test [--keep] [--keep-on-failure] [--e2e]
// --keep leaves the throwaway projects behind; --keep-on-failure only when a step failed;
// --e2e also runs the end-to-end tests of the two projects `harness create` makes (installs a
// browser). The tests of the sign-in and sync need a throwaway backend: Docker, or one that
// is already running at BACKEND_TEST_URL; without either they are left out, except in CI.
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
  for (const f of ['rules/AGENTS.md', 'decisions/index.md', 'decisions/README.md', 'agents/tester.md', 'skills/grill/SKILL.md', 'templates/task.md', 'hooks/pre-push', 'bin/harness.mjs'])
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
    '.claude/skills/grill/SKILL.md', '.claude/settings.json', '.githooks/pre-push',
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
  appendFileSync(join(project, '.claude/skills/grill/SKILL.md'), '\nA local edit.\n');
  fails(`${harness} check`, /\.claude\/skills\/grill\/SKILL\.md is missing or stale: run harness sync/);
  assert.match(ok(`${harness} sync`), /wrote \.claude\/skills\/grill\/SKILL\.md/);
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
  // G-0026 to G-0029 carry since: 0.4.0, a version never tagged: they came with 0.5.0.
  const changes04 = ok(`${harness} changes v0.3.0 v0.4.0`);
  const section = (title) => changes04.match(new RegExp(`## ${title}\\n\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1] ?? '';
  assert.match(section('Added'), /^- G-0026 /m);
  for (const id of ['G-0022', 'G-0024', 'G-0025']) assert.match(section('Replaced'), new RegExp(`^- ${id} .*\\(replaced by G-00\\d\\d\\)`, 'm'), `${id} is listed as replaced`);
  assert.doesNotMatch(ok(`${harness} changes v0.5.0 v0.6.0`), /G-002[6-9]/, 'G-0026 to G-0029 shipped with 0.5.0');

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
  const refused = fails(`${harness} nas pool.dataset.delete`, /is destructive \(G-0027\): ask the Engineer/, { env: nasEnv });
  assert.equal(refused.status, 2);
  fails(`${harness} nas pool.snapshot.create`, /Can't reach wss:\/\/localhost:9/, { env: nasEnv });

  // No infrastructure repository is set for these steps, whatever this machine has.
  const configDir = join(work, 'config');
  mkdirSync(configDir);
  const noInfra = { HARNESS_INFRA_REPO: '', HARNESS_INFRA_ENVIRONMENT: '', HARNESS_CONFIG_DIR: configDir };

  step('harness nas --remote refuses a destructive call before any workflow is started');
  const remoteRefused = fails(`${harness} nas --remote pool.dataset.delete '["x"]'`, /^pool\.dataset\.delete is destructive \(G-0027\): ask the Engineer in chat, then rerun with --confirmed\.$/m, { env: noInfra });
  assert.equal(remoteRefused.status, 2);
  assert.doesNotMatch(remoteRefused.out, /gh |workflow|only the Engineer/);

  step('harness infra init --dir writes the infrastructure repository\'s files, and nothing else');
  const infraDir = join(work, 'infra');
  const initOut = ok(`${harness} infra init --dir "${infraDir}"`, { env: noInfra });
  assert.match(initOut, /Nothing on GitHub was touched\./);
  const infraFilesFound = [];
  const walkInfra = (rel) => {
    for (const e of readdirSync(join(infraDir, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walkInfra(path);
      else infraFilesFound.push(path);
    }
  };
  walkInfra('');
  const callers = ['.github/workflows/check.yml', '.github/workflows/nas.yml', '.github/workflows/project-down.yml', '.github/workflows/project-up.yml'];
  assert.deepEqual(infraFilesFound.sort(), [...callers, 'README.md'].sort());
  for (const f of callers) {
    const text = readFileSync(join(infraDir, f), 'utf8');
    const uses = [...text.matchAll(/^\s*uses: (\S+)$/gm)].map((m) => m[1]);
    assert.equal(uses.length, 1, `${f} calls one reusable workflow`);
    assert.match(uses[0], new RegExp(`^SanderGeraedts/harness/\\.github/workflows/infra-[a-z-]+\\.yml@v${own.version.replaceAll('.', '\\.')}$`), `${f} is pinned to the tag`);
    assert.match(text, /^ {4}secrets: inherit$/m, `${f} passes secrets: inherit`);
    assert.match(text, /^ {6}environment: Prod$/m, `${f} names the environment`);
    assert.match(text, new RegExp(`^ {6}harness-ref: v${own.version.replaceAll('.', '\\.')}$`, 'm'), `${f} passes the tag on`);
    assert.match(text, /^ {2}workflow_dispatch:$/m);
  }
  // Each caller's reusable workflow exists in this harness.
  for (const f of callers) {
    const reusable = readFileSync(join(infraDir, f), 'utf8').match(/workflows\/(infra-[a-z-]+\.yml)@/)[1];
    assert.ok(existsSync(join(root, '.github', 'workflows', reusable)), `the harness has ${reusable}`);
  }
  const everything = infraFilesFound.map((f) => readFileSync(join(infraDir, f), 'utf8')).join('\n');
  for (const [what, re] of [
    ['an IPv4 address', /\b\d{1,3}(\.\d{1,3}){3}\b/],
    ['a dataset path', /\/mnt\//],
    ['a tailnet name', /\.ts\.net\b/],
    ['a Tailscale key', /tskey-/],
    ['a GitHub token', /\bgh[pousr]_[A-Za-z0-9]/],
    ['a Netlify token', /nfp_/],
    ['a key or certificate', /-----BEGIN/],
    ['a fingerprint', /([0-9A-F]{2}:){8}/i],
  ])
    assert.doesNotMatch(everything, re, `the generated files hold ${what}`);
  ok(`${harness} infra init --dir "${infraDir}" --environment Other`, { env: noInfra });
  assert.match(readFileSync(join(infraDir, '.github/workflows/nas.yml'), 'utf8'), /^ {6}environment: Other$/m);

  step('harness infra and nas --remote refuse an account that is not the Engineer');
  // A project that lists someone else. Signed in or not, this machine's account isn't them.
  const elsewhere = join(work, 'not-the-engineer');
  mkdirSync(join(elsewhere, '.harness'), { recursive: true });
  writeFileSync(join(elsewhere, '.harness', 'engineers'), 'engineer-of-another-project\n');
  const infraBin = `"${process.execPath}" "${join(installed, 'bin', 'harness.mjs')}"`;
  // What only reads (check, status) is refused a look; the rest a change.
  for (const [command, verb] of [['infra init', 'change'], ['infra init --repo someone/infra', 'change'], ['infra runner install', 'change'], ['nas --remote core.ping', 'change'], ['infra up spun-up', 'change'], ['infra down spun-up', 'change'], ['infra down spun-up --confirmed', 'change'], ['infra check', 'look at'], ['infra runner status', 'look at']])
    fails(`${infraBin} ${command}`, new RegExp(`only the Engineer may ${verb} the infrastructure \\(G-0026\\)`), { cwd: elsewhere, env: { ...noInfra, HARNESS_INFRA_REPO: 'someone/infra' } });

  step('Claude Code asks a human before a workflow is started with confirmed=true directly');
  const ask = JSON.parse(get('.claude/settings.json')).permissions.ask;
  for (const rule of ['Bash(*--confirmed*)', 'PowerShell(*--confirmed*)', 'Bash(*confirmed=true*)', 'PowerShell(*confirmed=true*)']) assert.ok(ask.includes(rule), `the ask rules hold ${rule}`);

  step('Claude Code asks a human before the teardown workflow is started directly, in any spelling');
  // An ask rule's * matches anything; a command it matches is asked about, in either shell.
  const asks = (tool, command) => ask.some((rule) => rule.startsWith(`${tool}(`) && new RegExp(`^${rule.slice(tool.length + 1, -1).split('*').map((p) => p.replace(/[.+?^${}()|[]\]/g, '\$&')).join('.*')}$`, 's').test(command));
  for (const command of [
    'gh workflow run project-down.yml --repo owner/infra -f project=p -f repository=owner/p -f confirmation=p',
    'gh workflow run project-down --repo owner/infra -f project=p -f confirmation=p',
    'GH_TOKEN=x gh api -X POST repos/owner/infra/actions/workflows/project-down.yml/dispatches -f ref=main -f "inputs[project]=p" -f "inputs[confirmation]=p"',
    'gh workflow run 123456 --repo owner/infra -f project=p -f confirmation=p',
    'pnpm exec harness infra down p --confirmed',
  ])
    for (const tool of ['Bash', 'PowerShell']) assert.ok(asks(tool, command), `${tool} asks before: ${command}`);
  // What only lists, and spin-up, ask nobody.
  for (const command of ['pnpm exec harness infra down p', 'pnpm exec harness infra up p']) assert.ok(!asks('Bash', command), `no ask for: ${command}`);

  step('harness infra and nas --remote stop with a plain message when no infrastructure repository is set');
  // As the Engineer of this project, told who is signed in: CI has no gh account.
  writeFileSync(
    join(work, 'infra-unset.mjs'),
    `import { main } from ${JSON.stringify(pathToFileURL(join(installed, 'lib', 'infra.mjs')).href)};
import { remoteNas } from ${JSON.stringify(pathToFileURL(join(installed, 'lib', 'infra.mjs')).href)};
const deps = { getLogin: () => 'engineer-one', gh: () => { throw new Error('gh must not be called'); }, interactive: false };
const codes = [];
for (const args of [['init'], ['check'], ['runner', 'install'], ['runner', 'status'], ['up', 'spun-up'], ['down', 'spun-up'], ['down', 'spun-up', '--confirmed']]) codes.push(await main(args, process.cwd(), deps));
codes.push(await remoteNas({ method: 'core.ping', params: [] }, { cwd: process.cwd(), ...deps }));
console.log('codes', codes.join(','));
`,
  );
  const unset = sh(`"${process.execPath}" "${join(work, 'infra-unset.mjs')}"`, { env: noInfra });
  assert.match(unset.out, /^codes 1,1,1,1,1,1,1,1$/m, unset.out);
  assert.equal(unset.out.match(/No private infrastructure repository is set \(G-0026\)\. Set it once with harness infra init --repo <owner>\/<name>, or set HARNESS_INFRA_REPO\./g)?.length, 8, unset.out);
  assert.doesNotMatch(unset.out, /gh must not be called/);
  assert.deepEqual(readdirSync(configDir), [], 'nothing was remembered');

  step('harness infra down without --confirmed lists what would go, exits 2 and starts nothing');
  // As the Engineer, with admin rights on a made-up infrastructure repository; gh only answers
  // who may, and any other call would fail the step.
  writeFileSync(
    join(work, 'infra-down.mjs'),
    `import { main } from ${JSON.stringify(pathToFileURL(join(installed, 'lib', 'infra.mjs')).href)};
const gh = (args) => {
  if (args[0] === 'repo' && args[1] === 'view') return JSON.stringify({ viewerPermission: 'ADMIN', visibility: 'PRIVATE' });
  throw new Error('nothing may be started: gh ' + args.join(' '));
};
console.log('code', await main(['down', 'spun-up'], process.cwd(), { getLogin: () => 'engineer-one', gh }));
`,
  );
  const listed = sh(`"${process.execPath}" "${join(work, 'infra-down.mjs')}"`, { env: { ...noInfra, HARNESS_INFRA_REPO: 'engineer-one/infra' } });
  assert.match(listed.out, /^code 2$/m, listed.out);
  assert.match(listed.out, /harness infra down spun-up would delete, for good:\n {2}- the Netlify site that builds from engineer-one\/spun-up[^\n]*\n {2}- on the NAS: the app spun-up, its snapshot task, and its dataset[^\n]*with every snapshot of it\n/);
  assert.match(listed.out, /with their yes, run it again with --confirmed\./);
  assert.doesNotMatch(listed.out, /nothing may be started/);

  step('the reusable infrastructure workflows: a job that uses a secret names the environment, only the NAS jobs run on its runner, and every caller passes what they take');
  const { parse } = await import('yaml');
  for (const [file, nasJobs] of Object.entries({ 'infra-nas.yml': ['nas'], 'infra-check.yml': ['check'], 'infra-project-up.yml': ['backend'], 'infra-project-down.yml': ['inspect', 'backend'] })) {
    const doc = parse(readFileSync(join(root, '.github', 'workflows', file), 'utf8'));
    for (const [id, j] of Object.entries(doc.jobs)) {
      if (/secrets\./.test(JSON.stringify(j))) assert.equal(j.environment, '${{ inputs.environment }}', `${file}: ${id} uses a secret`);
      assert.deepEqual(j['runs-on'], nasJobs.includes(id) ? ['self-hosted', 'harness-nas'] : 'ubuntu-latest', `${file}: ${id}`);
    }
  }
  for (const f of callers) {
    const job = Object.values(parse(readFileSync(join(infraDir, f), 'utf8')).jobs)[0];
    const reusable = parse(readFileSync(join(root, '.github', 'workflows', job.uses.match(/workflows\/(infra-[a-z-]+\.yml)@/)[1]), 'utf8'));
    assert.deepEqual(Object.keys(job.with).sort(), Object.keys(reusable.on.workflow_call.inputs).sort(), f);
  }

  step('the pre-push hook refuses the default branch and lets a feature branch through');
  const hook = (ref) => sh(`printf 'refs/heads/x 1 ${ref} 0\\n' | sh .githooks/pre-push`);
  assert.notEqual(hook('refs/heads/main').status, 0);
  assert.equal(hook('refs/heads/feature').status, 0);

  step('harness check accepts a decision replaced by a global one, and keeps the README\'s project section');
  const replacedFile = 'docs/decisions/D-0002-pnpm-is-the-package-manager.md';
  const replaced = get('docs/decisions/_template-decision.md')
    .replace('id: D-NNNN', 'id: D-0002')
    .replace('"The decision, as a statement"', '"pnpm is the package manager"')
    .replace('date: YYYY-MM-DD', 'date: 2026-01-02')
    .replace('status: Accepted', 'status: Replaced')
    .replace(/replaced_by: \[\]/, 'replaced_by: [G-0016]');
  put(replacedFile, replaced);
  appendFileSync(join(project, 'docs/decisions/index.md'), '- [D-0002 pnpm is the package manager](D-0002-pnpm-is-the-package-manager.md): pnpm. Replaced by G-0016.\n');
  assert.match(ok(`${harness} check`), /✓ decisions: 3 records, index complete, 1 overrule valid/);
  put(replacedFile, replaced.replace('[G-0016]', '[G-9999]'));
  fails(`${harness} check`, /replaced_by names G-9999, which isn't in the installed harness's global registry/);
  put(replacedFile, replaced);
  const readme = get('docs/decisions/README.md');
  assert.match(readme, /<!-- harness:project-section:start -->\n\nNothing yet\.\n\n<!-- harness:project-section:end -->\n$/);
  const ownNotes = readme.replace('Nothing yet.', 'Decisions about the shop live in docs/shop.');
  put('docs/decisions/README.md', ownNotes);
  ok(`${harness} check`);
  assert.match(ok(`${harness} sync`), /generated files are current/);
  put('docs/decisions/README.md', ownNotes.replace('# Decision registry', '# Our registry'));
  fails(`${harness} check`, /docs\/decisions\/README\.md is missing or stale: run harness sync/);
  assert.match(ok(`${harness} sync`), /wrote docs\/decisions\/README\.md/);
  assert.equal(get('docs/decisions/README.md'), ownNotes, 'sync kept the project section and restored the rest');
  ok(`${harness} check`);

  step('harness adopt in a second project that already has a registry with a decision matching a global one');
  const adopted = join(work, 'adopted');
  const inAdopted = { cwd: adopted };
  const putAdopted = (rel, content) => {
    mkdirSync(dirname(join(adopted, rel)), { recursive: true });
    writeFileSync(join(adopted, rel), content);
  };
  const getAdopted = (rel) => readFileSync(join(adopted, rel), 'utf8');
  mkdirSync(adopted);
  ok('git init -q -b main', inAdopted);
  putAdopted('package.json', `${JSON.stringify({ name: 'adopted', private: true, version: '0.0.0', type: 'module', packageManager: own.packageManager }, null, 2)}\n`);
  ok(`pnpm add -D "${join(work, tarball)}"`, inAdopted);
  const template = get('docs/decisions/_template-decision.md').replace('date: YYYY-MM-DD', 'date: 2026-01-02');
  putAdopted('docs/decisions/D-0001-pnpm-is-the-package-manager.md', template.replace('id: D-NNNN', 'id: D-0001').replace('"The decision, as a statement"', '"pnpm is the package manager"'));
  putAdopted('docs/decisions/D-0002-the-buttons-are-green.md', template.replace('id: D-NNNN', 'id: D-0002').replace('"The decision, as a statement"', '"The buttons are green"').replace('"One sentence saying what was decided, for the index."', '"Green, because the logo is."'));
  const ownIndex = '# Our decisions\n\n- [D-0001 pnpm is the package manager](D-0001-pnpm-is-the-package-manager.md): pnpm.\n- [D-0002 The buttons are green](D-0002-the-buttons-are-green.md): green.\n';
  const ownFiles = {
    'docs/decisions/index.md': ownIndex,
    'docs/decisions/README.md': '# How we record decisions\n\nOur own text.\n',
    'AGENTS.md': '# Our rules\n',
    '.githooks/pre-push': '#!/bin/sh\nexit 0\n',
  };
  for (const [rel, content] of Object.entries(ownFiles)) putAdopted(rel, content);
  const packageBefore = getAdopted('package.json');

  const report = ok(`${harness} adopt`, inAdopted);
  assert.match(report, /^harness adopt: what adopting harness \S+ means here\. Nothing was changed\./);
  assert.match(report, /Found\n {2}docs\/decisions: 2 decisions, 0 questions\n {2}docs\/tasks: not there yet/);
  assert.match(report, /Kept as they are \(nothing overwrites these\)\n {2}docs\/decisions\/index\.md: .*\n {2}AGENTS\.md: /);
  assert.match(report, /Would add \(harness adopt --write\)\n {2}\.harness\/engineers\n/);
  assert.match(report, /Differs from what the harness generates [^\n]*\n {2}\.githooks\/pre-push: sync replaces it\n {2}docs\/decisions\/README\.md: /);
  assert.match(report, /\n {2}D-0001 "pnpm is the package manager" \(docs\/decisions\/D-0001-pnpm-is-the-package-manager\.md\)\n {4}looks like G-0016 "pnpm is the package manager, pinned in package\.json" \(shares: pnpm, package, manager/);
  assert.doesNotMatch(report, /D-0002/, 'a decision that matches no global one is not a candidate');
  for (const [rel, content] of Object.entries(ownFiles)) assert.equal(getAdopted(rel), content, `adopt changed ${rel}`);
  assert.equal(getAdopted('package.json'), packageBefore, 'adopt changed package.json');
  for (const f of ['.harness/engineers', 'CLAUDE.md', '.claude/agents/tester.md', 'docs/tasks/index.md'])
    assert.ok(!existsSync(join(adopted, f)), `adopt without --write created ${f}`);

  const wrote = ok(`${harness} adopt --write engineer-one`, inAdopted);
  assert.match(wrote, /^harness adopt --write added what was missing and overwrote nothing:\n {2}created \.harness\/engineers\n/);
  for (const [rel, content] of Object.entries(ownFiles)) assert.equal(getAdopted(rel), content, `adopt --write overwrote ${rel}`);
  for (const f of ['.harness/engineers', 'CLAUDE.md', 'docs/lessons.md', '.claude/agents/tester.md', '.claude/settings.json', 'docs/decisions/_template-decision.md', 'docs/tasks/_template.md', 'docs/tasks/index.md'])
    assert.ok(existsSync(join(adopted, f)), `adopt --write did not create ${f}`);
  fails(`${harness} check`, /\.githooks\/pre-push is missing or stale: run harness sync/, inAdopted);

  // The project takes the candidate: the global decision replaces its own.
  putAdopted(
    'docs/decisions/D-0001-pnpm-is-the-package-manager.md',
    getAdopted('docs/decisions/D-0001-pnpm-is-the-package-manager.md').replace('status: Accepted', 'status: Replaced').replace(/replaced_by: \[\]/, 'replaced_by: [G-0016]'),
  );
  assert.match(ok(`${harness} sync`, inAdopted), /wrote \.githooks\/pre-push\nwrote docs\/decisions\/README\.md/);
  assert.match(ok(`${harness} check`, inAdopted), /✓ decisions: 2 records, index complete, 0 overrules valid/);
  assert.match(ok(`${harness} adopt`, inAdopted), /Would add\n {2}nothing: every file is there\n\nCandidates to replace with a global decision\n {2}none/);

  step('harness create refuses anyone who is not the Engineer');
  // Outside a project and without --engineer nobody is the Engineer, signed in or not.
  const bin = `"${process.execPath}" "${join(installed, 'bin', 'harness.mjs')}"`;
  fails(`${bin} create spun-up --purpose "Try the template." --no-github`, /only the Engineer creates a project \((G-0028)\)/, { cwd: work });
  assert.ok(!existsSync(join(work, 'spun-up')), 'a refused create must write nothing');
  assert.match(ok(`${harness} create --help`), /--harness-ref <ref>/);

  // Two projects, as `create` makes them: one that syncs (the default) and one that doesn't.
  // The installed copy, told who is signed in: CI has no gh account to be the Engineer.
  // The first has a title as long as a title may be, for the tests at 320px.
  const longTitle = 'A title as long as a title may be and not a character longer';
  assert.equal(longTitle.length, 60);
  const made = (dir) => (rel) => readFileSync(join(dir, rel), 'utf8');
  const tracked = (dir) => ok('git ls-files', { cwd: dir }).trim().split('\n');
  const createProject = (name, flags) => {
    const args = [name, '--purpose', 'Try the template.', '--engineer', 'engineer-one', '--accent', '#aa3366', '--language', 'nl', '--no-github', '--git-name', 'Self-test', '--git-email', 'self-test@example.invalid', '--harness-package', join(work, tarball), ...flags];
    writeFileSync(
      join(work, `create-${name}.mjs`),
      `import { main } from ${JSON.stringify(pathToFileURL(join(installed, 'lib', 'create.mjs')).href)};\nprocess.exitCode = await main(${JSON.stringify(args)}, process.cwd(), { getLogin: () => 'engineer-one', interactive: false });\n`,
    );
    const out = ok(`"${process.execPath}" create-${name}.mjs`, { cwd: work });
    const dir = join(work, name);
    for (const line of [/✓ engineers: 1 listed/, /✓ generated files: current/, /✓ first commit on main/, /Stopped before GitHub/]) assert.match(out, line);
    assert.equal(ok('git rev-list --count HEAD', { cwd: dir }).trim(), '1');
    assert.equal(ok('git status --porcelain', { cwd: dir }).trim(), '', 'everything is in the first commit');
    assert.equal(ok('git branch --show-current', { cwd: dir }).trim(), 'main');
    // The identity given is the first commit's, and this repository's from then on.
    assert.equal(ok('git log -1 --format=%an/%ae/%cn/%ce', { cwd: dir }).trim(), 'Self-test/self-test@example.invalid/Self-test/self-test@example.invalid');
    assert.equal(ok('git config --local user.email', { cwd: dir }).trim(), 'self-test@example.invalid');
    assert.match(ok('git ls-files -s .githooks/pre-push', { cwd: dir }), /^100755 /);
    const get = made(dir);
    assert.match(get('.harness/engineers'), /^engineer-one$/m);
    for (const wf of ['ci.yml', 'auto-merge.yml']) assert.ok(get(`.github/workflows/${wf}`).includes(`/.github/workflows/${wf}@v${own.version}\n`), `${wf} is pinned to the tag`);
    assert.match(get('docs/tasks/index.md'), /T-000\d Translate the interface/);
    for (const f of tracked(dir).filter((x) => /\.(ts|tsx|css|json|html|md|yml|sh|js|toml)$/.test(x))) assert.doesNotMatch(get(f), /__(PROJECT|ACCENT|ON_ACCENT|FONT|LANGUAGE|HARNESS_REF|DATE)[A-Z_]*__/, `${f} has a placeholder left`);
    for (const f of ['public/icons/icon-192.png', 'public/icons/icon.svg', 'pnpm-lock.yaml', '.gitignore']) assert.ok(existsSync(join(dir, f)), `create did not make ${f}`);
    return { dir, out, get, in: { cwd: dir } };
  };

  step('harness create --no-github makes a project that syncs, the default');
  const syncs = createProject('spun-up', ['--title', longTitle]);
  for (const line of [/with a backend, sign-in and sync/, /10 decisions and the first tasks recorded/, /✓ tasks: 3 tasks, index in step/, /✓ decisions: 10 records, index complete/]) assert.match(syncs.out, line);
  assert.match(syncs.get('AGENTS.md'), /^\*\*A title as long as a title may be and not a character longer\.\*\* Try the template\.$/m);
  assert.match(syncs.get('AGENTS.md'), /Only the user's own sign-out clears the device/);
  for (const f of ['backend/Dockerfile', 'backend/funnel.json', 'backend/smoke-test.sh', 'backend/throwaway.sh', 'backend/pb_migrations/1700000000_initial.js', 'backend/pb_hooks/newest_wins.pb.js', '.github/workflows/backend.yml', 'src/auth/auth.ts', 'src/sync/engine.ts', 'docs/decisions/D-0009-only-the-users-own-sign-out-clears-the-device.md'])
    assert.ok(tracked(syncs.dir).includes(f), `a project that syncs lacks ${f}`);
  assert.ok(syncs.get('.github/workflows/backend.yml').includes(`/.github/workflows/backend.yml@v${own.version}\n`), 'backend.yml is pinned to the tag');
  assert.match(syncs.get('.github/workflows/auto-merge.yml'), /backend-workflow: backend\.yml/);
  assert.ok(JSON.parse(syncs.get('package.json')).dependencies.pocketbase, 'a project that syncs has the backend client');
  assert.match(syncs.get('docs/decisions/index.md'), /D-0002 The app is local-first and syncs with its backend/);
  assert.match(syncs.get('docs/tasks/index.md'), /T-0002 Run the backend, give production its address, and make the first account/);

  step('harness create --no-sync makes a project without a backend, a sign-in or sync');
  const local = createProject('stays-local', ['--no-sync']);
  for (const line of [/without sync/, /5 decisions and the first tasks recorded/, /✓ tasks: 2 tasks, index in step/, /✓ decisions: 5 records, index complete/]) assert.match(local.out, line);
  assert.match(local.get('AGENTS.md'), /^\*\*Stays local\.\*\* Try the template\.$/m);
  for (const f of ['backend', 'src/auth', '.github/workflows/backend.yml', 'e2e/production']) assert.ok(!existsSync(join(local.dir, f)), `a project without sync has ${f}`);
  const localPackage = JSON.parse(local.get('package.json'));
  assert.ok(!('pocketbase' in { ...localPackage.dependencies, ...localPackage.devDependencies }), 'a project without sync has no backend client');
  assert.doesNotMatch(local.get('pnpm-lock.yaml'), /pocketbase/);
  assert.doesNotMatch(local.get('.github/workflows/auto-merge.yml') + local.get('AGENTS.md'), /backend/);
  assert.match(local.get('docs/decisions/index.md'), /D-0002 The app is local-first and ready to sync/);

  const connectSrc = (dir, out = 'dist') => readFileSync(join(dir, out, '_headers'), 'utf8').match(/connect-src ([^;]*);/)?.[1];
  for (const [what, project] of [['that syncs', syncs], ['without sync', local]]) {
    step(`the project ${what} installs, type-checks, passes its tests, builds and passes harness check`);
    ok('pnpm install --frozen-lockfile', project.in);
    ok('pnpm run typecheck', project.in);
    // Colour codes may sit between the words, so only the count is matched.
    assert.match(ok('pnpm test', project.in), /\d+ passed/);
    ok('pnpm run build', project.in);
    assert.ok(existsSync(join(project.dir, 'dist', 'sw.js')), 'the build has a service worker');
    // The content security policy is written at build time; this build has no backend.
    assert.equal(connectSrc(project.dir), "'self'");
    assert.match(ok(`${harness} check`, project.in), /✓ generated files: current/);
  }

  step('only a production build of the project that syncs holds the backend address, the backend client and its origin in the policy');
  // Every file a build serves, as one text.
  const served = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => readFileSync(join(e.parentPath, e.name), 'latin1')).join('\n');
  const address = 'https://backend.example';
  const client = 'auth-with-password'; // a path only the backend's client asks for
  const builds = { BACKEND_URL: `${address}/` };
  ok('pnpm exec vite build --outDir dist-preview', { ...syncs.in, env: { ...builds, CONTEXT: 'deploy-preview' } });
  const preview = served(join(syncs.dir, 'dist-preview'));
  assert.ok(!preview.includes('backend.example'), 'a preview build holds the backend address');
  assert.ok(!preview.includes(client), 'a preview build holds the backend client, and with it the sign-in');
  assert.equal(connectSrc(syncs.dir, 'dist-preview'), "'self'");
  ok('pnpm exec vite build --outDir dist-production', { ...syncs.in, env: { ...builds, CONTEXT: 'production' } });
  const production = served(join(syncs.dir, 'dist-production'));
  assert.ok(production.includes(address), 'a production build lacks the backend address');
  assert.ok(production.includes(client), 'a production build lacks the backend client');
  assert.equal(connectSrc(syncs.dir, 'dist-production'), `'self' ${address}`);
  const headers = (out) => readFileSync(join(syncs.dir, out, '_headers'), 'utf8');
  assert.equal(headers('dist-production').replace(` ${address}`, ''), headers('dist-preview'), 'the policy differs in more than the backend origin');
  // The local build of the step before, without CONTEXT, is like a preview.
  assert.ok(!served(join(syncs.dir, 'dist')).includes(client), 'a local build holds the backend client');
  // And a production build without an address syncs nothing.
  ok('pnpm exec vite build --outDir dist-no-address', { ...syncs.in, env: { BACKEND_URL: '', CONTEXT: 'production' } });
  assert.ok(!served(join(syncs.dir, 'dist-no-address')).includes(client), 'a production build without an address holds the backend client');
  assert.equal(ok('git status --porcelain', syncs.in).trim(), '', 'the builds are ignored by git');

  step('neither project holds an address, a network name, a storage path or a key');
  for (const project of [syncs, local]) {
    for (const f of tracked(project.dir).filter((x) => !/pnpm-lock\.yaml$|\.png$/.test(x))) {
      const text = project.get(f).replace(/127\.0\.0\.1|0\.0\.0\.0/g, '');
      for (const [what, pattern] of [['an IP address', /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/], ['a tailnet name', /\.ts\.net\b/], ['a storage path', /\/mnt\//], ['a key', /tskey-|ghp_|nfp_/]])
        assert.doesNotMatch(text, pattern, `${f} holds ${what}`);
    }
  }
  assert.match(syncs.get('backend/README.md'), /## What lives where/);

  if (process.argv.includes('--e2e')) {
    // The tests of the sign-in and sync need a throwaway backend: the project starts one
    // from its own backend/ with Docker, or uses the one at BACKEND_TEST_URL. CI has Docker.
    const hasBackend = Boolean(process.env.BACKEND_TEST_URL) || Boolean(process.env.CI) || sh('docker info').status === 0;
    step(`the project that syncs passes its end-to-end tests${hasBackend ? ', with the sign-in and sync against a throwaway backend' : ''}`);
    // Both projects pin the same Playwright, so this one install serves both.
    ok('pnpm exec playwright install chromium', syncs.in);
    const e2e = ok('pnpm exec playwright test --reporter=list', { ...syncs.in, env: { E2E_PORT: '4317' } });
    assert.match(e2e, /\d+ passed/);
    assert.doesNotMatch(e2e, /\d+ (failed|flaky)/);
    assert.match(e2e, /\[phone\] .*the list shows the seeded items, and says it is demo data/);
    assert.match(e2e, /\[phone\] .*there is no sign-in, no "Account" link, and \/account is "Not found"/);
    if (hasBackend) {
      for (const test of [/signed out, every address shows the sign-in screen and nothing of the app/, /an item made on one page appears on another/, /signing out syncs first/, /a sign-in the backend ended never puts the sign-in screen in place of the app/, /no screen of the sign-in and the account is wider than a 320px phone/])
        assert.match(e2e, new RegExp(`\\[production\\] .*${test.source}`), `the production tests did not run: ${test.source}`);
    } else console.log('    no Docker and no BACKEND_TEST_URL here: the tests of the sign-in and sync were left out');

    step('the project without sync passes its end-to-end tests');
    const localE2e = ok('pnpm exec playwright test --reporter=list', { ...local.in, env: { E2E_PORT: '4327' } });
    assert.match(localE2e, /\d+ passed/);
    assert.doesNotMatch(localE2e, /\d+ (failed|flaky|skipped)/);
  }

  console.log(`\n✓ self-test passed: ${steps} steps, harness ${own.version} in a throwaway project`);
} catch (e) {
  console.error(`\n✗ self-test failed at step ${steps}: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (process.argv.includes('--keep') || (process.exitCode && process.argv.includes('--keep-on-failure'))) console.log(`kept ${work}`);
  else rmSync(work, { recursive: true, force: true, maxRetries: 3 });
}
