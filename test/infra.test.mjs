import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { parseDocument } from 'yaml';
import { job, main, remoteNas } from '../lib/infra.mjs';
import { requireAdmin, requireListedEngineer } from '../lib/infra/access.mjs';
import { CALLERS, LATER_SECRETS, SECRETS, infraFiles } from '../lib/infra/callers.mjs';
import { MARKER, parseResult, resultLines, runWorkflow } from '../lib/infra/remote.mjs';
import { ENTRYPOINT, RUNNER_APP, RUNNER_IMAGE, RUNNER_NAME, installRunner, runnerCompose } from '../lib/infra/runner.mjs';
import { DEFAULT_ENVIRONMENT, NO_REPO, infraSettings, readSettings, settingsFile, writeSettings } from '../lib/infra/settings.mjs';
import { HARNESS_ROOT } from '../lib/paths.mjs';
import { cleanUp, tempDir, write } from './helpers.mjs';

after(cleanUp);

const workflow = (name) => readFileSync(join(HARNESS_ROOT, '.github', 'workflows', name), 'utf8').replace(/\r\n/g, '\n');

// A real YAML parser: any error or warning fails, so a file GitHub can't read fails here.
function parseYaml(text, label) {
  const doc = parseDocument(text, { prettyErrors: true, uniqueKeys: true });
  const problems = [...doc.errors, ...doc.warnings].map((e) => e.message);
  assert.deepEqual(problems, [], `${label} isn't valid YAML:\n${problems.join('\n')}`);
  const value = doc.toJS();
  assert.equal(typeof value, 'object', `${label} is not a mapping`);
  return value;
}

// Every workflow file the harness has or hands out, generated ones aside.
const workflowFiles = () =>
  ['.github/workflows', 'template/_github/workflows', 'template-sync/_github/workflows']
    .filter((dir) => existsSync(join(HARNESS_ROOT, dir)))
    .flatMap((dir) => readdirSync(join(HARNESS_ROOT, dir)).filter((f) => /\.ya?ml$/.test(f)).map((f) => `${dir}/${f}`));

describe('every workflow is valid YAML', () => {
  it('finds the workflow files', () => {
    const files = workflowFiles();
    for (const f of ['.github/workflows/infra-nas.yml', '.github/workflows/ci.yml', 'template/_github/workflows/ci.yml', 'template-sync/_github/workflows/backend.yml'])
      assert.ok(files.includes(f), `${f} is among them`);
  });

  for (const rel of workflowFiles())
    it(rel, () => {
      const doc = parseYaml(readFileSync(join(HARNESS_ROOT, rel), 'utf8'), rel);
      assert.ok(doc.on, `${rel} has triggers`);
      assert.ok(doc.jobs && Object.keys(doc.jobs).length, `${rel} has jobs`);
    });

  it('the four generated callers, with any environment and ref', () => {
    for (const [ref, environment] of [['v0.6.0', 'Prod'], ['0123456789abcdef0123456789abcdef01234567', 'my-env.2'], ['feature/x', 'Other']])
      for (const [path, text] of Object.entries(infraFiles({ ref, environment })))
        if (path.endsWith('.yml')) parseYaml(text, `${path} (${ref}, ${environment})`);
  });

  it('the parser catches what GitHub refuses, such as ": " in a plain value', () => {
    assert.throws(() => parseYaml('on:\n  x:\n    description: The project syncs: it gets a backend\n', 'example'), /isn't valid YAML/);
  });
});

// The workflow_call inputs a reusable workflow declares, with whether each is required.
function declaredInputs(yaml) {
  const block = yaml.match(/\n {2}workflow_call:\n {4}inputs:\n([\s\S]*?)\n(?=\S)/)?.[1] ?? '';
  const found = {};
  for (const part of block.split(/\n(?= {6}\S)/)) {
    const name = part.match(/^ {6}([\w-]+):/)?.[1];
    if (name) found[name] = { required: /\n {8}required: true/.test(part) };
  }
  return found;
}

// Words that would identify the infrastructure, or a secret.
const IDENTIFYING = [/\b\d{1,3}(\.\d{1,3}){3}\b/, /\/mnt\//, /\.ts\.net\b/, /tskey-/, /\bgh[pousr]_[A-Za-z0-9]/, /-----BEGIN/, /([0-9A-F]{2}:){8}/i];

describe('infra: the settings', () => {
  const env = (extra = {}) => ({ HARNESS_CONFIG_DIR: tempDir(), ...extra });

  it('has no default repository, and says how to set one', () => {
    assert.throws(() => infraSettings({}, env()), (e) => e.message === NO_REPO);
    assert.match(NO_REPO, /harness infra init --repo <owner>\/<name>, or set HARNESS_INFRA_REPO/);
  });

  it('takes the flag, then the variable, then the file; Prod by default', () => {
    const e = env();
    writeSettings({ repo: 'from/file' }, e);
    assert.equal(readSettings(e).repo, 'from/file');
    assert.deepEqual(infraSettings({}, e), { repo: 'from/file', environment: DEFAULT_ENVIRONMENT });
    assert.equal(infraSettings({}, { ...e, HARNESS_INFRA_REPO: 'from/variable' }).repo, 'from/variable');
    assert.equal(infraSettings({ repo: 'from/flag' }, { ...e, HARNESS_INFRA_REPO: 'from/variable' }).repo, 'from/flag');
    assert.equal(infraSettings({}, { ...e, HARNESS_INFRA_ENVIRONMENT: 'Other' }).environment, 'Other');
    writeSettings({ environment: 'Saved' }, e);
    assert.deepEqual(readSettings(e), { repo: 'from/file', environment: 'Saved' });
  });

  it('refuses what is not a repository or an environment name', () => {
    assert.throws(() => infraSettings({ repo: 'no-slash' }, env()), /isn't a repository as owner\/name/);
    assert.throws(() => infraSettings({ repo: 'a/b', environment: 'has space' }, env()), /isn't an environment name/);
  });

  it('lives in the user-level config folder', () => {
    assert.equal(settingsFile({ HARNESS_CONFIG_DIR: 'x' }), join('x', 'harness', 'infra.json'));
    assert.equal(settingsFile({ XDG_CONFIG_HOME: 'y' }), join('y', 'harness', 'infra.json'));
  });
});

describe('infra: the generated files', () => {
  const files = infraFiles({ ref: 'v9.8.7', environment: 'Prod' });

  it('are four thin callers and a README', () => {
    assert.deepEqual(Object.keys(files).sort(), ['.github/workflows/check.yml', '.github/workflows/nas.yml', '.github/workflows/project-down.yml', '.github/workflows/project-up.yml', 'README.md']);
  });

  it('pin every call to the tag, inherit the secrets and name the environment', () => {
    for (const c of CALLERS) {
      const text = files[`.github/workflows/${c.file}`];
      assert.match(text, new RegExp(`^ {4}uses: SanderGeraedts/harness/\\.github/workflows/${c.reusable.replace('.', '\\.')}@v9\\.8\\.7$`, 'm'));
      assert.match(text, /^ {4}secrets: inherit$/m);
      assert.match(text, /^ {6}environment: Prod$/m);
      assert.match(text, /^ {6}harness-ref: v9\.8\.7$/m);
      assert.match(text, /^run-name: "[\w-]+ \$\{\{ inputs\.request-id \}\}"$/m);
      assert.match(text, /^on:\n {2}workflow_dispatch:\n/m);
    }
  });

  it("pass exactly the inputs each reusable workflow declares, and give it every required one", () => {
    for (const c of CALLERS) {
      const declared = declaredInputs(workflow(c.reusable));
      const passed = [...files[`.github/workflows/${c.file}`].split('\n    with:\n')[1].matchAll(/^ {6}([\w-]+):/gm)].map((m) => m[1]);
      for (const p of passed) assert.ok(declared[p], `${c.file} passes ${p}, which ${c.reusable} doesn't declare`);
      for (const [name, { required }] of Object.entries(declared)) if (required) assert.ok(passed.includes(name), `${c.file} doesn't pass the required ${name}`);
      for (const name of ['environment', 'harness-ref', 'request-id']) assert.ok(passed.includes(name), `${c.file} passes ${name}`);
    }
  });

  it('hold nothing that identifies the infrastructure', () => {
    const all = Object.values(infraFiles({ ref: 'v1.0.0', environment: 'Prod' })).join('\n');
    for (const re of IDENTIFYING) assert.doesNotMatch(all, re);
  });

  it('are valid YAML that a parser reads back as meant: every description whole, every input passed on', () => {
    for (const environment of ['Prod', 'Other']) {
      for (const c of CALLERS) {
        const text = infraFiles({ ref: 'v9.8.7', environment })[`.github/workflows/${c.file}`];
        const doc = parseYaml(text, `${c.file} (${environment})`);
        assert.equal(doc.name, c.name);
        assert.equal(doc['run-name'], `${c.name} \${{ inputs.request-id }}`);
        const inputs = doc.on.workflow_dispatch.inputs;
        for (const [name, o] of c.inputs) {
          assert.equal(inputs[name].description, o.description, `${c.file}: ${name}'s description`);
          assert.equal(inputs[name].type, o.type ?? 'string');
        }
        const job = doc.jobs[c.job];
        assert.equal(job.uses, `SanderGeraedts/harness/.github/workflows/${c.reusable}@v9.8.7`);
        assert.equal(job.secrets, 'inherit');
        assert.equal(job.with.environment, environment);
        assert.deepEqual(Object.keys(job.with).sort(), ['environment', 'harness-ref', ...Object.keys(inputs)].sort());
      }
    }
  });

  it('carry the environment given', () => {
    assert.match(infraFiles({ ref: 'v1.0.0', environment: 'Other' })['.github/workflows/nas.yml'], /^ {6}environment: Other$/m);
  });
});

describe('infra: the reusable workflows', () => {
  for (const name of ['infra-nas.yml', 'infra-check.yml']) {
    it(`${name} runs on the runner on the NAS, in the environment given, one NAS job at a time`, () => {
      const text = workflow(name);
      assert.match(text, /^ {4}runs-on: \[self-hosted, harness-nas\]$/m);
      assert.match(text, /^ {4}environment: \$\{\{ inputs\.environment \}\}$/m);
      assert.match(text, /^ {4}concurrency:\n {6}group: harness-nas\n {6}cancel-in-progress: false$/m);
      assert.match(text, /^ {10}repository: SanderGeraedts\/harness\n {10}ref: \$\{\{ inputs\.harness-ref \}\}$/m);
      // The inputs reach the command as variables, never as text in a script.
      for (const line of text.split('\n').filter((l) => /^\s+run: /.test(l))) assert.doesNotMatch(line, /\$\{\{/, line);
      // Node is there before pnpm's installer needs it.
      assert.ok(text.indexOf('actions/setup-node') < text.indexOf('pnpm/action-setup'));
    });
  }

  it('infra-check reports each secret by whether it exists, never by its value', () => {
    const text = workflow('infra-check.yml');
    for (const s of [...SECRETS, ...Object.keys(LATER_SECRETS)]) assert.match(text, new RegExp(`HAS_${s}: \\$\\{\\{ secrets\\.${s} != '' \\}\\}`));
  });

  it('infra-nas passes --confirmed on only as the input says', () => {
    assert.match(workflow('infra-nas.yml'), /NAS_CONFIRMED: \$\{\{ inputs\.confirmed \}\}/);
    assert.equal(declaredInputs(workflow('infra-nas.yml')).confirmed.required, false);
  });

  // The jobs that reach the NAS, by workflow; every other job runs on GitHub's runner.
  const NAS_JOBS = { 'infra-nas.yml': ['nas'], 'infra-check.yml': ['check'], 'infra-project-up.yml': ['backend'], 'infra-project-down.yml': ['inspect', 'backend'] };

  for (const [name, nasJobs] of Object.entries(NAS_JOBS))
    it(`${name}: a job that uses a secret names the environment, and only ${nasJobs.join(' and ')} run${nasJobs.length > 1 ? '' : 's'} on the NAS's runner`, () => {
      const doc = parseYaml(workflow(name), name);
      for (const [id, j] of Object.entries(doc.jobs)) {
        const text = JSON.stringify(j);
        if (/secrets\./.test(text)) assert.equal(j.environment, '${{ inputs.environment }}', `${name}: ${id} uses a secret`);
        for (const s of text.match(/secrets\.(\w+)/g) ?? []) assert.ok([...SECRETS, ...Object.keys(LATER_SECRETS)].includes(s.slice(8)), `${name}: ${id} uses ${s}`);
        if (nasJobs.includes(id)) {
          assert.deepEqual(j['runs-on'], ['self-hosted', 'harness-nas'], `${name}: ${id}`);
          assert.deepEqual(j.concurrency, { group: 'harness-nas', 'cancel-in-progress': false }, `${name}: ${id} is one NAS job at a time`);
        } else assert.equal(j['runs-on'], 'ubuntu-latest', `${name}: ${id} runs on GitHub's runner`);
        // The harness at the caller's tag, and every input as a variable, never in a script.
        const checkout = j.steps.find((s) => s.uses === 'actions/checkout@v5');
        assert.deepEqual(checkout.with, { repository: 'SanderGeraedts/harness', ref: '${{ inputs.harness-ref }}', path: 'harness', 'persist-credentials': false }, `${name}: ${id}`);
        for (const s of j.steps.filter((x) => x.run)) assert.doesNotMatch(s.run, /\$\{\{/, `${name}: ${id}: ${s.run}`);
        const harness = j.steps.filter((s) => /harness\.mjs infra job|harness\.mjs nas/.test(s.run ?? ''));
        assert.equal(harness.length, 1, `${name}: ${id} runs one harness job`);
      }
    });

  it('infra-project-up: the site first, then the address and the backend side by side, then the checks, each only when it can', () => {
    const doc = parseYaml(workflow('infra-project-up.yml'), 'infra-project-up.yml');
    assert.deepEqual(Object.keys(doc.jobs), ['site', 'address', 'backend', 'checks']);
    assert.equal(doc.jobs.site.needs, undefined);
    assert.equal(doc.jobs.address.needs, undefined);
    assert.equal(doc.jobs.address.if, 'inputs.sync');
    assert.equal(doc.jobs.backend.needs, 'site');
    assert.equal(doc.jobs.backend.if, 'inputs.sync');
    assert.deepEqual(doc.jobs.checks.needs, ['site', 'address', 'backend']);
    assert.match(doc.jobs.checks.if, /needs\.site\.outputs\.linked == 'true'/);
    assert.match(doc.jobs.checks.if, /!inputs\.sync \|\| \(needs\.address\.outputs\.ready == 'true' && needs\.backend\.outputs\.ready == 'true'\)/);
    // The address node is tagged tag:harness, with the OAuth client.
    const ts = doc.jobs.address.steps[0];
    assert.equal(ts.uses, 'tailscale/github-action@v4');
    assert.equal(ts.with.tags, 'tag:harness');
    // The backend gets the pull token, the site's address and the inputs as variables.
    const env = doc.jobs.backend.steps.at(-1).env;
    for (const k of ['TRUENAS_API_KEY', 'TS_OAUTH_CLIENT_ID', 'TS_OAUTH_SECRET', 'GHCR_PULL_TOKEN', 'PROJECT', 'REPOSITORY', 'PRIVATE', 'FUNNEL_PATHS', 'SITE_URL']) assert.ok(env[k], k);
    assert.equal(env.SITE_URL, '${{ needs.site.outputs.site-url }}');
    assert.equal(doc.jobs.checks.steps.at(-1).env.BACKEND_URL, '${{ needs.address.outputs.backend-url }}');
  });

  it('infra-project-down: inspects the NAS before anything goes, then the site, then the backend, each with the confirmation', () => {
    const doc = parseYaml(workflow('infra-project-down.yml'), 'infra-project-down.yml');
    assert.deepEqual(Object.keys(doc.jobs), ['inspect', 'site', 'backend']);
    assert.equal(doc.jobs.site.needs, 'inspect');
    assert.equal(doc.jobs.backend.needs, 'site');
    for (const j of Object.values(doc.jobs)) assert.equal(j.steps.at(-1).env.CONFIRMATION, '${{ inputs.confirmation }}');
    assert.equal(declaredInputs(workflow('infra-project-down.yml')).confirmation.required, true);
  });
});

describe('infra: the runner app', () => {
  const config = { repo: 'owner/infra', host: 'nas.example', pin: 'AA:BB', appsDataset: 'pool/apps', mountpoint: '/somewhere/runner' };

  it('has the token only when one is given', () => {
    assert.equal(runnerCompose(config).services.runner.environment.RUNNER_TOKEN, undefined);
    assert.equal(runnerCompose({ ...config, token: 'the-token' }).services.runner.environment.RUNNER_TOKEN, 'the-token');
  });

  it('gets its own dataset and nothing else: no container socket, no other volume', () => {
    const { runner } = runnerCompose(config).services;
    assert.deepEqual(runner.volumes, ['/somewhere/runner:/state']);
    assert.doesNotMatch(JSON.stringify(runner), /docker\.sock|privileged|network_mode|cap_add|devices/);
    assert.equal(runner.image, RUNNER_IMAGE);
    assert.match(RUNNER_IMAGE, /^ghcr\.io\/actions\/actions-runner:\d+\.\d+\.\d+$/);
    assert.equal(runner.restart, 'unless-stopped');
  });

  it("carries the NAS's settings for the jobs, and the registration's", () => {
    const { environment } = runnerCompose(config).services.runner;
    assert.equal(environment.TRUENAS_HOST, 'nas.example');
    assert.equal(environment.TRUENAS_CERT_SHA256, 'AA:BB');
    assert.equal(environment.TRUENAS_APPS_DATASET, 'pool/apps');
    assert.equal(environment.RUNNER_URL, 'https://github.com/owner/infra');
    assert.equal(environment.RUNNER_LABELS, 'harness-nas');
    assert.equal(environment.TRUENAS_API_KEY, undefined, 'the key comes from the GitHub environment, per job');
  });

  it('writes every $ of its entrypoint as $$, for compose', () => {
    assert.doesNotMatch(ENTRYPOINT.replaceAll('$$', ''), /\$/);
    assert.match(ENTRYPOINT, /unset RUNNER_TOKEN\nexec setpriv --reuid=runner/);
    assert.match(ENTRYPOINT, /if \[ -f \/state\/\.runner \]/);
  });

  it('refuses a configuration without a setting', () => {
    assert.throws(() => runnerCompose({ ...config, pin: '' }), /needs pin/);
  });
});

// A NAS stand-in that records calls; `state` is what it holds.
function fakeNas(state = {}) {
  const calls = [];
  const nas = {
    calls,
    async call(method, params) {
      calls.push([method, params]);
      if (method === 'pool.dataset.query') {
        const id = params[0][0][2];
        return (state.datasets ?? []).filter((d) => d.id === id);
      }
      if (method === 'pool.dataset.create') {
        const d = { id: params[0].name, mountpoint: `/fake/${params[0].name}` };
        (state.datasets ??= []).push(d);
        return d;
      }
      if (method === 'app.query') return state.app ? [state.app] : [];
      if (method === 'app.config') return state.config;
      if (state.fail?.[method]) throw Object.assign(new Error(state.fail[method]), { detail: { reason: state.fail[method] } });
      return null;
    },
    async job(method, params) {
      calls.push([method, params]);
      if (state.fail?.[method]) throw Object.assign(new Error(state.fail[method]), { detail: { reason: state.fail[method] } });
      if (method === 'app.create') state.app = { name: params[0].app_name };
      if (method === 'app.create' || method === 'app.update') state.config = (params[1] ?? params[0]).custom_compose_config;
      return {};
    },
    close() {},
  };
  return nas;
}

// gh for the runner: the registration token, and the runners list.
function fakeGh({ online = [true], token = 'AAAA-the-registration-token' } = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args.join(' '));
    if (args.some((a) => a.endsWith('/registration-token'))) return JSON.stringify({ token, expires_at: 'x' });
    if (/actions\/runners$/.test(args.at(-1))) {
      const up = online.length > 1 ? online.shift() : online[0];
      return JSON.stringify({ runners: up === undefined ? [] : [{ id: 1, name: RUNNER_NAME, status: up ? 'online' : 'offline', busy: false, labels: [{ name: 'self-hosted' }, { name: 'harness-nas' }] }] });
    }
    return '';
  };
  return { gh, calls };
}

describe('infra: installing the runner', () => {
  const base = { repo: 'owner/infra', host: 'nas.example', pin: 'AA:BB', appsDataset: 'pool/apps', wait: async () => {}, waitOptions: { every: 0 } };

  it('creates the dataset and the app, waits for the runner, then drops the token; the token is never logged', async () => {
    const nas = fakeNas({ datasets: [{ id: 'pool/apps', mountpoint: '/fake/pool/apps' }] });
    const { gh, calls } = fakeGh({ online: [undefined, false, true] });
    const said = [];
    await installRunner({ ...base, nas, gh, log: (m) => said.push(m) });
    const methods = nas.calls.map(([m]) => m);
    assert.deepEqual(methods, ['pool.dataset.query', 'pool.dataset.query', 'pool.dataset.create', 'app.query', 'app.create', 'app.update']);
    assert.equal(nas.calls[2][1][0].name, 'pool/apps/harness-runner');
    const created = nas.calls[4][1][0];
    assert.equal(created.app_name, RUNNER_APP);
    assert.equal(created.custom_compose_config.services.runner.environment.RUNNER_TOKEN, 'AAAA-the-registration-token');
    assert.deepEqual(created.custom_compose_config.services.runner.volumes, ['/fake/pool/apps/harness-runner:/state']);
    const updated = nas.calls[5][1];
    assert.equal(updated[0], RUNNER_APP);
    assert.equal(updated[1].custom_compose_config.services.runner.environment.RUNNER_TOKEN, undefined);
    assert.equal(calls.filter((c) => c.includes('registration-token')).length, 1);
    assert.doesNotMatch(said.join('\n'), /AAAA-the-registration-token/);
    assert.deepEqual(said, [
      "✓ the runner's dataset: created",
      '✓ the runner app: created',
      `✓ the runner ${RUNNER_NAME}: online, labels self-hosted, harness-nas`,
      "✓ the registration token: removed from the app's configuration",
      `✓ the runner ${RUNNER_NAME}: online after a restart without the token`,
    ]);
  });

  it('run again, it changes nothing and asks for no token', async () => {
    const nas = fakeNas({ datasets: [{ id: 'pool/apps' }, { id: 'pool/apps/harness-runner', mountpoint: '/fake/r' }], app: { name: RUNNER_APP } });
    nas.call = ((original) => async (m, p) => (m === 'app.config' ? runnerCompose({ ...base, mountpoint: '/fake/r' }) : original(m, p)))(nas.call);
    const { gh, calls } = fakeGh();
    const said = [];
    await installRunner({ ...base, nas, gh, log: (m) => said.push(m) });
    assert.ok(!calls.some((c) => c.includes('registration-token')));
    assert.ok(!nas.calls.some(([m]) => m === 'app.create' || m === 'app.update'));
    assert.deepEqual(said, ["✓ the runner's dataset: already there", '✓ the runner app: already there, nothing changed', `✓ the runner ${RUNNER_NAME}: online`]);
  });

  it('keeps the token out of an error, and still drops it from the app', async () => {
    const token = 'BBBB-secret';
    const nas = fakeNas({ datasets: [{ id: 'pool/apps' }], app: { name: RUNNER_APP }, fail: { 'app.update': undefined } });
    // The first update (with the token) fails with a message that echoes it.
    let first = true;
    const job = nas.job;
    nas.job = async (m, p) => {
      if (m === 'app.update' && first) {
        first = false;
        throw Object.assign(new Error(`invalid config: RUNNER_TOKEN=${token}`), { detail: { config: token } });
      }
      return job(m, p);
    };
    const { gh } = fakeGh({ online: [false], token });
    await assert.rejects(installRunner({ ...base, nas, gh, log: () => {} }), (e) => !e.message.includes(token) && !JSON.stringify(e.detail).includes(token) && /<token>/.test(e.message));
    const last = nas.calls.at(-1);
    assert.equal(last[0], 'app.update');
    assert.equal(last[1][1].custom_compose_config.services.runner.environment.RUNNER_TOKEN, undefined);
  });

  it('needs the parent dataset, and one that exists', async () => {
    await assert.rejects(installRunner({ ...base, appsDataset: '', nas: fakeNas(), gh: fakeGh().gh }), /Set TRUENAS_APPS_DATASET/);
    await assert.rejects(installRunner({ ...base, nas: fakeNas(), gh: fakeGh().gh }), /names no dataset/);
  });
});

describe('infra: a run and its result', () => {
  it('carries a result through the log, in chunks, among timestamped lines', () => {
    const result = { code: 0, stdout: 'x'.repeat(10000) + ' ✓ ünïcode', stderr: '' };
    const lines = resultLines(result);
    assert.ok(lines.length > 2);
    const log = ['2026-01-01T00:00:00.0000000Z ##[group]Run node harness/bin/harness.mjs infra job nas', ...lines.map((l) => `2026-01-01T00:00:01.0000000Z ${l}`)].join('\r\n');
    assert.deepEqual(parseResult(log), result);
    assert.equal(parseResult(lines.slice(1).join('\n')), undefined, 'a missing chunk is no result');
    assert.equal(parseResult('nothing here'), undefined);
    for (const l of lines) assert.ok(l.startsWith(`${MARKER} `));
  });

  // gh for a workflow run: the dispatch, the run list, the run's state, the job's log.
  function fakeRun({ states = ['queued', 'in_progress', 'completed'], result = { code: 0, stdout: '"pong"', stderr: '' }, runner = 'online' } = {}) {
    const calls = [];
    let requestId;
    const gh = (args) => {
      calls.push(args.join(' '));
      if (args[0] === 'workflow' && args[1] === 'run') {
        requestId = args.find((a) => a.startsWith('request-id=')).slice('request-id='.length);
        return '';
      }
      if (args[0] === 'run' && args[1] === 'list') return JSON.stringify([{ databaseId: 1, displayTitle: 'nas someone-else' }, { databaseId: 42, displayTitle: `nas ${requestId}`, status: 'queued', url: 'the-url' }]);
      if (args[0] === 'run' && args[1] === 'view') {
        const status = states.length > 1 ? states.shift() : states[0];
        return JSON.stringify({ status, conclusion: status === 'completed' ? 'success' : '', url: 'the-url', jobs: [{ databaseId: 7 }] });
      }
      if (args[0] === 'run' && args[1] === 'cancel') return '';
      if (args[0] === 'api' && args.at(-1) === 'repos/o/r/actions/jobs/7/logs') return resultLines(result).map((l) => `2026-01-01T00:00:00Z ${l}`).join('\n');
      if (args[0] === 'api' && args.at(-1) === 'repos/o/r/actions/runners') return JSON.stringify({ runners: [{ id: 1, name: RUNNER_NAME, status: runner, labels: [] }] });
      throw new Error(`unexpected gh ${args.join(' ')}`);
    };
    return { gh, calls };
  }

  it('starts the workflow with a request id, finds its run by it, waits, and reads the result', async () => {
    const { gh, calls } = fakeRun();
    const { run, result } = await runWorkflow({ repo: 'o/r', workflow: 'nas.yml', inputs: { method: 'core.ping', params: '[]' }, gh, wait: async () => {} });
    assert.match(calls[0], /^workflow run nas\.yml --repo o\/r -f method=core\.ping -f params=\[\] -f request-id=[0-9a-f]{16}$/);
    assert.equal(run.databaseId, 42);
    assert.deepEqual(result, { code: 0, stdout: '"pong"', stderr: '' });
  });

  it('lets a few failed looks at the run pass, as a network hiccup', async () => {
    const { gh: inner } = fakeRun();
    let fails = 0;
    const gh = (args) => {
      if (args[0] === 'run' && fails < 3) {
        fails++;
        throw new Error('gh run list failed: EOF');
      }
      return inner(args);
    };
    const { result } = await runWorkflow({ repo: 'o/r', workflow: 'nas.yml', gh, wait: async () => {} });
    assert.deepEqual(result, { code: 0, stdout: '"pong"', stderr: '' });
  });

  it('cancels a run that waits for an offline runner, so it never runs later', async () => {
    const { gh, calls } = fakeRun({ states: ['queued'], runner: 'offline' });
    await assert.rejects(runWorkflow({ repo: 'o/r', workflow: 'nas.yml', gh, wait: async () => {}, queuedTries: 3 }), /runner harness-nas on the NAS is offline, so the run was cancelled: the-url/);
    assert.ok(calls.includes('run cancel 42 --repo o/r'));
  });
});

describe('infra: who may', () => {
  it('refuses when gh is not signed in, or the account is not listed here', () => {
    const cwd = tempDir();
    assert.throws(() => requireListedEngineer({ cwd, getLogin: () => undefined }), /only the Engineer may change the infrastructure \(G-0026\), and gh is not signed in/);
    write(cwd, '.harness/engineers', 'the-engineer\n');
    assert.throws(() => requireListedEngineer({ cwd, getLogin: () => 'someone' }), /someone is not in this project's \.harness\/engineers/);
    assert.equal(requireListedEngineer({ cwd, getLogin: () => 'The-Engineer' }), 'The-Engineer');
    // Outside a project, the admin check decides.
    assert.equal(requireListedEngineer({ cwd: tempDir(), getLogin: () => 'anyone' }), 'anyone');
    assert.throws(() => requireListedEngineer({ cwd, getLogin: () => 'someone', reads: true }), /^Error: only the Engineer may look at the infrastructure \(G-0026\): someone is not in/);
  });

  it('needs admin rights on a private repository', () => {
    const gh = (found) => () => (found ? JSON.stringify(found) : (() => { throw new Error('not found'); })());
    assert.throws(() => requireAdmin({ repo: 'o/r', login: 'me', gh: gh() }), /me can't see o\/r/);
    assert.throws(() => requireAdmin({ repo: 'o/r', login: 'me', gh: gh({ viewerPermission: 'WRITE', visibility: 'PRIVATE' }) }), /me has no admin rights on o\/r/);
    assert.throws(() => requireAdmin({ repo: 'o/r', login: 'me', gh: gh({ viewerPermission: 'ADMIN', visibility: 'PUBLIC' }) }), /must be private \(G-0026\)\. Its visibility is the Engineer's to change/);
    assert.equal(requireAdmin({ repo: 'o/r', login: 'me', gh: gh({ viewerPermission: 'ADMIN', visibility: 'PRIVATE', isEmpty: false }) }).isEmpty, false);
  });
});

// Runs a command's main with console output captured.
async function capture(fn) {
  const out = [];
  const err = [];
  const [log, error] = [console.log, console.error];
  console.log = (m) => out.push(String(m));
  console.error = (m) => err.push(String(m));
  try {
    const code = await fn((m) => out.push(String(m)));
    return { code, out: out.join('\n'), err: err.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe('infra: the command', () => {
  const noRepo = () => ({ HARNESS_CONFIG_DIR: tempDir() });
  const refusingGh = () => {
    throw new Error('gh must not be called');
  };

  it('init --dir writes the files and touches nothing else', async () => {
    const dir = join(tempDir(), 'infra');
    const r = await capture((log) => main(['init', '--dir', dir, '--harness-ref', 'v1.2.3'], tempDir(), { env: noRepo(), gh: refusingGh, getLogin: () => undefined, log }));
    assert.equal(r.code, 0, r.err);
    assert.ok(existsSync(join(dir, '.github/workflows/nas.yml')));
    assert.match(readFileSync(join(dir, '.github/workflows/check.yml'), 'utf8'), /@v1\.2\.3$/m);
    assert.match(r.out, /Nothing on GitHub was touched/);
  });

  it('every command stops with a plain message when no repository is set, before calling gh', async () => {
    for (const args of [['init'], ['check'], ['runner', 'install'], ['runner', 'status']]) {
      const r = await capture(() => main(args, tempDir(), { env: noRepo(), gh: refusingGh, getLogin: () => 'the-engineer', interactive: false }));
      assert.equal(r.code, 1, args.join(' '));
      assert.equal(r.err, `✗ ${NO_REPO}`);
    }
    const r = await capture(() => remoteNas({ method: 'core.ping', params: [] }, { env: noRepo(), cwd: tempDir(), gh: refusingGh, getLogin: () => 'the-engineer' }));
    assert.equal(r.code, 1);
    assert.equal(r.err, `✗ ${NO_REPO}`);
  });

  it('refuses an account that is not the Engineer, before reading any setting', async () => {
    const cwd = tempDir();
    write(cwd, '.harness/engineers', 'the-engineer\n');
    // A command that only reads is refused a look, not a change.
    for (const [args, verb] of [[['init'], 'change'], [['runner', 'install'], 'change'], [['check'], 'look at'], [['runner', 'status'], 'look at']]) {
      const r = await capture(() => main(args, cwd, { env: noRepo(), gh: refusingGh, getLogin: () => 'someone-else' }));
      assert.equal(r.code, 1);
      assert.equal(r.err, `✗ only the Engineer may ${verb} the infrastructure (G-0026): someone-else is not in this project's .harness/engineers`, args.join(' '));
    }
    const r = await capture(() => remoteNas({ method: 'core.ping', params: [] }, { env: noRepo(), cwd, gh: refusingGh, getLogin: () => 'someone-else' }));
    assert.match(r.err, /only the Engineer may change the infrastructure \(G-0026\)/);
  });

  it('nas --remote starts nas.yml with the call, and prints what the run recorded', async () => {
    const calls = [];
    let requestId;
    const gh = (args) => {
      calls.push(args.join(' '));
      if (args[0] === 'repo' && args[1] === 'view') return JSON.stringify({ viewerPermission: 'ADMIN', visibility: 'PRIVATE', isEmpty: false });
      if (args[0] === 'workflow') {
        requestId = args.at(-1).split('=')[1];
        return '';
      }
      if (args[1] === 'list') return JSON.stringify([{ databaseId: 3, displayTitle: `nas ${requestId}`, status: 'completed', url: 'u' }]);
      if (args[1] === 'view') return JSON.stringify({ status: 'completed', conclusion: 'failure', jobs: [{ databaseId: 9 }] });
      if (args[0] === 'api') return resultLines({ code: 2, stdout: '', stderr: 'refused there' }).join('\n');
      throw new Error(args.join(' '));
    };
    const r = await capture(() => remoteNas({ method: 'app.query', params: [[['name', '=', 'x']]], job: false, confirmed: false }, { env: { HARNESS_CONFIG_DIR: tempDir(), HARNESS_INFRA_REPO: 'o/infra' }, cwd: tempDir(), gh, getLogin: () => 'o', wait: async () => {} }));
    assert.equal(r.code, 2);
    assert.equal(r.err, 'refused there');
    assert.ok(calls.includes(`workflow run nas.yml --repo o/infra -f method=app.query -f params=[[["name","=","x"]]] -f job=false -f confirmed=false -f request-id=${requestId}`));
  });

  it('runner status prints online, or what it is', async () => {
    const env = { HARNESS_CONFIG_DIR: tempDir(), HARNESS_INFRA_REPO: 'o/infra' };
    const view = JSON.stringify({ viewerPermission: 'ADMIN', visibility: 'PRIVATE' });
    for (const [online, code, line] of [[true, 0, 'harness-nas: online (self-hosted, harness-nas)'], [false, 1, 'harness-nas: offline (self-hosted, harness-nas)'], [undefined, 1, 'harness-nas: not installed']]) {
      const { gh } = fakeGh({ online: [online] });
      const said = [];
      const result = await main(['runner', 'status'], tempDir(), { env, getLogin: () => 'o', gh: (a) => (a[0] === 'repo' ? view : gh(a)), log: (m) => said.push(m) });
      assert.equal(result, code);
      assert.deepEqual(said, [line]);
    }
  });
});

describe('infra: the jobs on the runner', () => {
  it('nas: refuses a destructive call that was not confirmed, and records the result', async () => {
    const printed = [];
    const code = await job('nas', { NAS_METHOD: 'pool.dataset.delete', NAS_PARAMS: '["x"]', NAS_CONFIRMED: 'false' }, (l) => printed.push(l));
    assert.equal(code, 2);
    assert.equal(printed[0], 'harness nas: exit 2');
    assert.match(parseResult(printed.join('\n')).stderr, /pool\.dataset\.delete is destructive \(G-0027\)/);
  });

  it('check: names each missing secret and setting, never a value', async () => {
    const printed = [];
    const code = await job('check', { HAS_NETLIFY_AUTH_TOKEN: 'true', HAS_TS_OAUTH_CLIENT_ID: 'true', HAS_TS_OAUTH_SECRET: 'false', HAS_TRUENAS_API_KEY: 'true', HAS_GHCR_PULL_TOKEN: 'false', TRUENAS_HOST: '' }, (l) => printed.push(l));
    assert.equal(code, 1);
    const { stdout } = parseResult(printed.join('\n'));
    assert.match(stdout, /^✓ the secret NETLIFY_AUTH_TOKEN$/m);
    assert.match(stdout, /^✗ the secret TS_OAUTH_SECRET is missing from the environment$/m);
    assert.match(stdout, /^· the secret GHCR_PULL_TOKEN isn't there yet/m);
    assert.match(stdout, /^✗ the runner's configuration lacks TRUENAS_HOST, TRUENAS_CERT_SHA256, TRUENAS_APPS_DATASET/m);
    assert.match(stdout, /^✗ the NAS didn't answer core\.ping: Set TRUENAS_HOST/m);
  });
});

describe('infra init, on a repository', () => {
  // A local bare repository stands in for GitHub's; gh is a fake.
  const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const identity = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  Object.assign(process.env, identity);

  function fakeGitHub({ exists = true, isEmpty = false, secrets = [...SECRETS], environment = true, runner = 'online' } = {}) {
    const remote = join(tempDir(), 'remote.git');
    git(['init', '-q', '--bare', '-b', 'main', remote]);
    const calls = [];
    const state = { exists, isEmpty };
    const gh = (args) => {
      const line = args.join(' ');
      calls.push(line);
      if (args[0] === 'repo' && args[1] === 'view') {
        if (!state.exists) throw new Error('not found');
        return JSON.stringify({ viewerPermission: 'ADMIN', visibility: 'PRIVATE', isEmpty: state.isEmpty });
      }
      if (args[0] === 'repo' && args[1] === 'create') {
        state.exists = true;
        return '';
      }
      if (args[0] === 'pr' && args[1] === 'create') return 'https://github.com/o/infra/pull/1\n';
      if (args[0] === 'pr' && args[1] === 'diff') {
        const branch = calls.find((c) => c.startsWith('pr create')).match(/--head (\S+)/)[1];
        return git(['diff', '--name-only', 'main', branch], remote).stdout;
      }
      if (args[0] === 'pr' && args[1] === 'merge') {
        const branch = calls.find((c) => c.startsWith('pr create')).match(/--head (\S+)/)[1];
        git(['update-ref', 'refs/heads/main', `refs/heads/${branch}`], remote);
        return '';
      }
      if (/environments\//.test(line)) {
        if (!environment) throw new Error('HTTP 404');
        return '{}';
      }
      if (args[0] === 'secret') return JSON.stringify(secrets.map((name) => ({ name })));
      if (/actions\/runners$/.test(line)) return JSON.stringify({ runners: runner ? [{ id: 1, name: RUNNER_NAME, status: runner, labels: [] }] : [] });
      throw new Error(`unexpected gh ${line}`);
    };
    return { remote, gh, calls, state };
  }
  const run = async (args, gitHub, env = { HARNESS_CONFIG_DIR: tempDir() }) => {
    const said = [];
    const code = await main(['init', ...args], tempDir(), { env, gh: gitHub.gh, getLogin: () => 'o', remoteUrl: () => gitHub.remote, interactive: false, log: (m) => said.push(m) });
    return { code, said };
  };
  const filesAt = (remote) => git(['ls-tree', '-r', '--name-only', 'main'], remote).stdout.trim().split('\n').sort();

  it('creates the repository, private, and makes the first commit', async () => {
    const gh = fakeGitHub({ exists: false });
    const env = { HARNESS_CONFIG_DIR: tempDir() };
    const { code, said } = await run(['--repo', 'o/infra', '--harness-ref', 'v1.0.0'], gh, env);
    assert.equal(code, 0, said.join('\n'));
    assert.ok(gh.calls.some((c) => c.startsWith('repo create o/infra --private')));
    assert.deepEqual(filesAt(gh.remote), Object.keys(infraFiles({ ref: 'v1.0.0', environment: 'Prod' })).sort());
    assert.equal(readSettings(env).repo, 'o/infra', 'the repository is remembered');
    assert.match(said.join('\n'), /✓ created o\/infra \(private\)\n[\s\S]*✓ files: the first commit on main, pinned to harness v1\.0\.0/);
  });

  it('updates an existing repository through a pull request it merges, and says nothing changed the next time', async () => {
    const gh = fakeGitHub();
    // The repository has a README of its own already.
    const seed = tempDir();
    git(['clone', '-q', gh.remote, seed]);
    write(seed, 'README.md', 'by hand\n');
    git(['add', '-A'], seed);
    git(['commit', '-q', '-m', 'first'], seed);
    git(['push', '-q', 'origin', 'main'], seed);

    const first = await run(['--repo', 'o/infra', '--harness-ref', 'v1.0.0'], gh);
    assert.equal(first.code, 0, first.said.join('\n'));
    assert.match(first.said.join('\n'), /✓ files: updated and merged through https:\/\/github\.com\/o\/infra\/pull\/1, pinned to harness v1\.0\.0/);
    assert.ok(gh.calls.some((c) => c.startsWith('pr merge https://github.com/o/infra/pull/1 --repo o/infra --squash')));
    assert.deepEqual(filesAt(gh.remote), Object.keys(infraFiles({ ref: 'v1.0.0', environment: 'Prod' })).sort());

    const second = await run(['--repo', 'o/infra', '--harness-ref', 'v1.0.0'], gh);
    assert.equal(second.code, 0);
    const text = second.said.join('\n');
    assert.match(text, /✓ files: nothing changed \(harness v1\.0\.0\)/);
    assert.match(text, /✓ the environment Prod/);
    for (const s of SECRETS) assert.match(text, new RegExp(`✓ the secret ${s}$`, 'm'));
    assert.match(text, /· the secret GHCR_PULL_TOKEN isn't there yet/);
    assert.match(text, /✓ the runner harness-nas: online\nNext: prove the whole chain with harness infra check$/);
    assert.equal(gh.calls.filter((c) => c.startsWith('pr create')).length, 1, 'no second pull request');
  });

  it("names what the Engineer still has to add, without fixing it", async () => {
    const gh = fakeGitHub({ isEmpty: true, secrets: ['TRUENAS_API_KEY'], runner: null });
    const { code, said } = await run(['--repo', 'o/infra'], gh);
    assert.equal(code, 0);
    const text = said.join('\n');
    assert.match(text, /! Remaining: the secret NETLIFY_AUTH_TOKEN is missing from the environment Prod; the Engineer adds it/);
    assert.match(text, /! Remaining: the runner on the NAS is not installed: at home, run harness infra runner install/);
    assert.doesNotMatch(text, /Next: prove/);
    assert.ok(!gh.calls.some((c) => /secret set|environments.* -X/.test(c)));
  });

  it('refuses a repository that is not private', async () => {
    const gh = fakeGitHub();
    const view = gh.gh;
    gh.gh = (args) => (args[0] === 'repo' && args[1] === 'view' ? JSON.stringify({ viewerPermission: 'ADMIN', visibility: 'PUBLIC', isEmpty: false }) : view(args));
    const r = await capture(async () => (await run(['--repo', 'o/infra'], gh)).code);
    assert.equal(r.code, 1);
    assert.match(r.err, /o\/infra is public: the infrastructure repository must be private \(G-0026\)/);
    assert.ok(!gh.calls.some((c) => c.startsWith('pr ') || c.startsWith('repo create')));
    assert.equal(filesAt(gh.remote).join(''), '', 'nothing was pushed');
  });
});
