// Spin-up and teardown (T-0004), against fakes for the NAS, Netlify, Tailscale, gh and the
// internet. Nothing here reaches a real service (G-0015).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { main } from '../lib/infra.mjs';
import { downBackend, inspectBackend, upBackend } from '../lib/infra/backend.mjs';
import { checkBackend, checkSite } from '../lib/infra/checks.mjs';
import { deleteSite, ensureSite, findSite, setSiteVariable } from '../lib/infra/netlify.mjs';
import { ADMIN_PORT, backendCompose, checkFunnelPaths, imageOf, serveConfig } from '../lib/infra/project.mjs';
import { resultLines } from '../lib/infra/remote.mjs';
import { RUNNER_NAME } from '../lib/infra/runner.mjs';
import { spinJob } from '../lib/infra/spinup.mjs';
import { readTailnet } from '../lib/infra/tailscale.mjs';
import { HARNESS_ROOT } from '../lib/paths.mjs';
import { cleanUp, tempDir, write } from './helpers.mjs';

after(cleanUp);

const PATHS = ['/api/health', '/api/collections/users/', '/api/collections/items/'];
const SITE = 'https://my-project.netlify.app';
// Made-up stand-ins for what the real services hand out; the tests check none leaks.
const KEY = 'tskey-auth-fake-0123456789';
const PULL = 'ghp_fakepulltoken0123456789';

describe('spin-up: the Funnel paths', () => {
  it("accepts the template's list", () => {
    assert.deepEqual(checkFunnelPaths(PATHS), PATHS);
    assert.deepEqual(checkFunnelPaths(JSON.parse(readFileSync(join(HARNESS_ROOT, 'template-sync', 'backend', 'funnel.json'), 'utf8'))), PATHS);
  });

  for (const [paths, reason] of [
    [[], /non-empty JSON list/],
    ['/api/health', /non-empty JSON list/],
    [['/api/'], /would open \/api\/ whole/],
    [['/api'], /would open \/api\/ whole/],
    [['/_/'], /isn't a path under \/api\/[\s\S]*would open the admin screen/],
    [['/api/collections/_superusers/'], /would open the superusers/],
    [['/api/collections/_SuperUsers/records'], /would open the superusers/],
    [['/health'], /isn't a path under \/api\//],
    [['/api/../_/'], /holds \. or \.\./],
    [['/api/x y'], /isn't a path under \/api\//],
    [[42], /42 isn't a path/],
    [['/api/health', '/api/health'], /is there twice/],
  ])
    it(`refuses ${JSON.stringify(paths)}`, () => assert.throws(() => checkFunnelPaths(paths), reason));
});

describe('spin-up: the backend app', () => {
  const config = { project: 'my-project', repository: 'Engineer-One/my-project', siteOrigin: SITE, mountpoint: '/data/apps/my-project', paths: PATHS };

  it('is the compose file stored with the tests, for an example project', () => {
    const stored = JSON.parse(readFileSync(join(HARNESS_ROOT, 'test', 'fixtures', 'backend-compose.json'), 'utf8'));
    assert.deepEqual(backendCompose(config), stored);
  });

  it('serves only the allowed paths through Funnel, and the admin screen on its own port to the tailnet', () => {
    const serve = serveConfig(PATHS);
    assert.deepEqual(Object.keys(serve.Web['${TS_CERT_DOMAIN}:443'].Handlers), PATHS);
    assert.deepEqual(serve.AllowFunnel, { '${TS_CERT_DOMAIN}:443': true });
    assert.ok(serve.Web[`\${TS_CERT_DOMAIN}:${ADMIN_PORT}`]);
    // In the compose file the container's variable is written $$, so compose leaves it alone.
    const content = backendCompose(config).configs.serve.content;
    assert.ok(content.includes('"$${TS_CERT_DOMAIN}:443"'));
    assert.doesNotMatch(content.replaceAll('$${TS_CERT_DOMAIN}', ''), /\$\{/);
  });

  it('publishes no port, listens on the loopback only, and gives CORS to the site only', () => {
    const c = backendCompose(config);
    for (const s of Object.values(c.services)) assert.equal(s.ports, undefined);
    assert.equal(c.services.pocketbase.network_mode, 'service:tailscale');
    assert.ok(c.services.pocketbase.command.includes('--http=127.0.0.1:8090'));
    assert.ok(c.services.pocketbase.command.includes(`--origins=${SITE}`));
    assert.equal(c.services.pocketbase.image, imageOf('Engineer-One/my-project'));
    assert.equal(c.services.pocketbase.image, 'ghcr.io/engineer-one/my-project-backend:stable');
    // Watchtower updates this project's PocketBase only.
    assert.equal(c.services.watchtower.environment.WATCHTOWER_SCOPE, 'my-project');
    assert.equal(c.services.pocketbase.labels['com.centurylinklabs.watchtower.scope'], 'my-project');
    assert.equal(c.services.tailscale.labels['com.centurylinklabs.watchtower.enable'], undefined);
  });

  it('carries the auth key only when asked, and the pull token only for a private repository', () => {
    const plain = JSON.stringify(backendCompose(config));
    assert.ok(!plain.includes('TS_AUTHKEY') && !plain.includes('REPO_PASS'));
    const first = backendCompose({ ...config, authKey: KEY, pullToken: PULL });
    assert.equal(first.services.tailscale.environment.TS_AUTHKEY, KEY);
    assert.equal(first.services.watchtower.environment.REPO_PASS, PULL);
    assert.equal(first.services.watchtower.environment.REPO_USER, 'Engineer-One');
  });

  it('refuses what it cannot use', () => {
    assert.throws(() => backendCompose({ ...config, siteOrigin: 'http://x.example' }), /isn't an https address/);
    assert.throws(() => backendCompose({ ...config, project: 'Bad_Name' }), /isn't a project name/);
    assert.throws(() => backendCompose({ ...config, paths: ['/_/'] }), /funnel\.json is refused/);
    assert.throws(() => backendCompose({ ...config, mountpoint: '' }), /needs mountpoint/);
  });
});

// A NAS in memory, as the client's `call` and `job` see it.
function fakeNas({ datasets = {}, apps = {}, tasks = [], registries = [], failOn } = {}) {
  const calls = [];
  const state = { datasets: { 'tank/apps': { id: 'tank/apps', mountpoint: '/data/apps' }, ...datasets }, apps, tasks, registries, snapshotsRun: 0 };
  const where = (filters) => (x) => filters.every(([k, , v]) => x[k] === v);
  const handle = async (method, params) => {
    calls.push(method);
    if (failOn === method) throw new Error(`${method} failed: ${JSON.stringify(params)}`);
    switch (method) {
      case 'pool.dataset.query':
        return Object.values(state.datasets).filter(where(params[0]));
      case 'pool.dataset.create': {
        const d = { id: params[0].name, mountpoint: `/data/${params[0].name.split('/').slice(1).join('/')}`, user_properties: Object.fromEntries((params[0].user_properties ?? []).map((p) => [p.key, { value: p.value }])) };
        state.datasets[d.id] = d;
        return d;
      }
      case 'pool.dataset.delete':
        for (const id of Object.keys(state.datasets)) if (id === params[0] || id.startsWith(`${params[0]}/`)) delete state.datasets[id];
        return true;
      case 'pool.snapshottask.query':
        return state.tasks.filter(where(params[0]));
      case 'pool.snapshottask.create': {
        const t = { id: state.tasks.length + 1, ...params[0] };
        state.tasks.push(t);
        return t;
      }
      case 'pool.snapshottask.run':
        state.snapshotsRun++;
        return null;
      case 'pool.snapshottask.delete':
        state.tasks = state.tasks.filter((t) => t.id !== params[0]);
        return true;
      case 'app.registry.query':
        return state.registries.filter(where(params[0]));
      case 'app.registry.create':
        state.registries.push({ id: 1, ...params[0] });
        return state.registries[0];
      case 'app.registry.update':
        return Object.assign(state.registries.find((r) => r.id === params[0]), params[1]);
      case 'app.query':
        return Object.entries(state.apps).filter(([name]) => where(params[0])({ name })).map(([name, a]) => ({ name, state: a.state ?? 'RUNNING' }));
      case 'app.config':
        return state.apps[params[0]].config;
      case 'app.create':
        state.apps[params[0].app_name] = { config: params[0].custom_compose_config, state: 'RUNNING' };
        return null;
      case 'app.update':
        state.apps[params[0]].config = params[1].custom_compose_config;
        return null;
      case 'app.delete':
        delete state.apps[params[0]];
        return null;
      default:
        throw new Error(`the fake NAS doesn't know ${method}`);
    }
  };
  return { calls, state, call: handle, job: handle, close() {} };
}

describe('spin-up: the backend job', () => {
  const base = { project: 'my-project', repository: 'engineer-one/my-project', isPrivate: true, siteUrl: SITE, paths: PATHS, appsDataset: 'tank/apps', pullToken: PULL, wait: async () => {} };
  const keys = () => {
    const made = [];
    return { made, createKey: async (d) => (made.push(d), KEY) };
  };

  it('makes the dataset, the snapshot task, the pull token and the app, in that order, and drops the key', async () => {
    const nas = fakeNas();
    const { made, createKey } = keys();
    const lines = [];
    const r = await upBackend({ ...base, nas, createKey, log: (l) => lines.push(l) });
    assert.equal(r.ready, true);
    const order = ['pool.dataset.create', 'pool.snapshottask.create', 'pool.snapshottask.run', 'app.registry.create', 'app.create', 'app.update'];
    const at = order.map((m) => nas.calls.indexOf(m));
    assert.ok(at.every((i) => i >= 0), nas.calls.join(' '));
    assert.deepEqual([...at].sort((a, b) => a - b), at, nas.calls.join(' '));
    assert.equal(made.length, 1);
    assert.deepEqual(Object.keys(nas.state.datasets).sort(), ['tank/apps', 'tank/apps/my-project', 'tank/apps/my-project/pb_data', 'tank/apps/my-project/tailscale']);
    assert.deepEqual(nas.state.datasets['tank/apps/my-project'].user_properties, { 'harness:project': { value: 'my-project' } });
    const [task] = nas.state.tasks;
    assert.deepEqual([task.dataset, task.recursive, task.enabled, task.lifetime_value, task.lifetime_unit, task.schedule.minute, task.schedule.hour], ['tank/apps/my-project', true, true, 2, 'WEEK', '0', '*']);
    assert.equal(nas.state.snapshotsRun, 1, 'a first snapshot before any data');
    // After the first start the app holds no key.
    assert.doesNotMatch(JSON.stringify(nas.state.apps['my-project'].config), /tskey-|TS_AUTHKEY/);
    assert.match(lines.join('\n'), /✓ the auth key: removed from the app's configuration/);
    for (const l of lines) assert.doesNotMatch(l, /tskey-|ghp_|\/data\/|tank/, l);
  });

  it('a second run makes nothing and says "already there" for each step', async () => {
    const nas = fakeNas();
    await upBackend({ ...base, nas, ...keys() });
    const before = JSON.stringify(nas.state);
    nas.calls.length = 0;
    const { made, createKey } = keys();
    const lines = [];
    await upBackend({ ...base, nas, createKey, log: (l) => lines.push(l) });
    assert.equal(made.length, 0, 'no second key');
    assert.ok(!nas.calls.some((c) => /\.create$|app\.update|snapshottask\.run/.test(c)), nas.calls.join(' '));
    assert.equal(JSON.stringify(nas.state).replace(/"password":"[^"]*"/, ''), before.replace(/"password":"[^"]*"/, ''));
    for (const what of ["the project's dataset", 'the snapshot task', 'the app']) assert.match(lines.join('\n'), new RegExp(`✓ ${what}: already there`));
  });

  it('a private project without GHCR_PULL_TOKEN gets its dataset and snapshot task, no app, and a Remaining line', async () => {
    const nas = fakeNas();
    const { made, createKey } = keys();
    const lines = [];
    const r = await upBackend({ ...base, pullToken: '', nas, createKey, log: (l) => lines.push(l) });
    assert.equal(r.ready, false);
    assert.equal(made.length, 0);
    assert.ok(nas.calls.includes('pool.snapshottask.create'));
    assert.ok(!nas.calls.some((c) => c.startsWith('app.')));
    assert.match(lines.at(-1), /^Remaining: engineer-one\/my-project is private, so the NAS needs GHCR_PULL_TOKEN .* adds it as the secret GHCR_PULL_TOKEN, then runs harness infra up my-project\.$/);
  });

  it('a public project needs no pull token, and its app holds none', async () => {
    const nas = fakeNas();
    await upBackend({ ...base, isPrivate: false, pullToken: PULL, nas, ...keys() });
    assert.ok(!nas.calls.some((c) => c.startsWith('app.registry')));
    assert.doesNotMatch(JSON.stringify(nas.state.apps['my-project'].config), /REPO_PASS|ghp_/);
  });

  it("refuses a dataset or an app of the project's name that spin-up didn't make, and changes nothing", async () => {
    const byHand = fakeNas({ datasets: { 'tank/apps/my-project': { id: 'tank/apps/my-project', mountpoint: '/data/apps/my-project' } } });
    await assert.rejects(upBackend({ ...base, nas: byHand, ...keys() }), /a dataset named my-project exists .* that spin-up didn't make/);
    assert.ok(!byHand.calls.some((c) => /create|update|delete/.test(c)));
    const app = fakeNas({ apps: { 'my-project': { config: { services: { x: {} } } } } });
    await assert.rejects(upBackend({ ...base, nas: app, ...keys() }), /an app named my-project exists on the NAS that spin-up didn't make/);
    assert.ok(!app.calls.some((c) => c.startsWith('app.create') || c.startsWith('app.update')));
  });

  it('a failing step names the step, holds no secret, and still drops the key', async () => {
    const nas = fakeNas();
    // The app is created but never runs.
    const job = nas.job;
    nas.job = async (m, p) => {
      const r = await job(m, p);
      if (m === 'app.create') nas.state.apps['my-project'].state = 'CRASHED';
      return r;
    };
    await assert.rejects(upBackend({ ...base, nas, ...keys(), waitOptions: { tries: 2 } }), (e) => /the app my-project didn't start/.test(e.message) && !/tskey-|ghp_/.test(e.message));
    assert.doesNotMatch(JSON.stringify(nas.state.apps['my-project'].config), /tskey-/);
    // An error from the NAS that repeats the parameters is scrubbed.
    const failing = fakeNas({ failOn: 'app.create' });
    await assert.rejects(upBackend({ ...base, nas: failing, ...keys() }), (e) => /app\.create failed/.test(e.message) && !e.message.includes(KEY) && !e.message.includes(PULL));
  });
});

describe('teardown: the backend', () => {
  it('deletes the app, the snapshot task and the dataset, in that order', async () => {
    const nas = fakeNas();
    await upBackend({ project: 'my-project', repository: 'o/my-project', isPrivate: false, siteUrl: SITE, paths: PATHS, appsDataset: 'tank/apps', nas, createKey: async () => KEY, wait: async () => {} });
    nas.calls.length = 0;
    const lines = [];
    await downBackend({ nas, project: 'my-project', appsDataset: 'tank/apps', log: (l) => lines.push(l) });
    const at = ['app.delete', 'pool.snapshottask.delete', 'pool.dataset.delete'].map((m) => nas.calls.indexOf(m));
    assert.ok(at[0] >= 0 && at[0] < at[1] && at[1] < at[2], nas.calls.join(' '));
    assert.deepEqual(Object.keys(nas.state.datasets), ['tank/apps']);
    assert.deepEqual(nas.state.tasks, []);
    assert.deepEqual(nas.state.apps, {});
    // Again: everything is already gone.
    const again = [];
    await downBackend({ nas, project: 'my-project', appsDataset: 'tank/apps', log: (l) => again.push(l) });
    assert.equal(again.filter((l) => /already gone/.test(l)).length, 3);
  });

  it('refuses a dataset without the mark, and an app without the label, before deleting anything', async () => {
    const nas = fakeNas({ datasets: { 'tank/apps/my-project': { id: 'tank/apps/my-project', user_properties: { 'harness:project': { value: 'another' } } } } });
    await assert.rejects(downBackend({ nas, project: 'my-project', appsDataset: 'tank/apps' }), /that spin-up didn't make/);
    await assert.rejects(inspectBackend({ nas, project: 'my-project', appsDataset: 'tank/apps' }), /that spin-up didn't make/);
    const app = fakeNas({ apps: { 'my-project': { config: { services: {} } } } });
    await assert.rejects(downBackend({ nas: app, project: 'my-project', appsDataset: 'tank/apps' }), /an app named my-project exists on the NAS that spin-up didn't make/);
    for (const n of [nas, app]) assert.ok(!n.calls.some((c) => c.endsWith('.delete')), n.calls.join(' '));
  });
});

// Netlify in memory, as its API answers.
function fakeNetlify({ sites = [], env = {} } = {}) {
  const calls = [];
  const state = { sites, env, builds: 0 };
  let next = 100;
  const api = async (path, { method = 'GET', body, query, missing } = {}) => {
    calls.push(`${method} ${path}`);
    let m;
    if (path === '/sites' && method === 'GET') return query.page === 1 ? state.sites : [];
    if (path === '/sites' && method === 'POST') {
      if (state.sites.some((s) => s.name === body.name) || body.name === 'taken') {
        const e = new Error('Netlify answered 422');
        e.status = 422;
        throw e;
      }
      const s = { id: `site-${next++}`, name: body.name, ssl_url: `https://${body.name}.netlify.app`, account_id: 'acc', build_settings: {} };
      state.sites.push(s);
      return s;
    }
    if ((m = path.match(/^\/sites\/([\w-]+)$/))) {
      const s = state.sites.find((x) => x.id === m[1]);
      if (method === 'PATCH') {
        s.build_settings = { provider: body.repo.provider, repo_path: body.repo.repo_path, repo_url: body.repo.repo_url, installation_id: body.repo.installation_id };
        return s;
      }
      if (method === 'DELETE') {
        state.sites = state.sites.filter((x) => x !== s);
        return undefined;
      }
    }
    if ((m = path.match(/^\/accounts\/acc\/env\/(\w+)$/))) {
      const key = `${query.site_id}:${m[1]}`;
      if (method === 'GET') return state.env[key] ?? (missing ? undefined : assert.fail('404'));
      if (method === 'PUT') return (state.env[key] = body);
    }
    if (path === '/accounts/acc/env' && method === 'POST') {
      for (const v of body) state.env[`${query.site_id}:${v.key}`] = v;
      return body;
    }
    if ((m = path.match(/^\/sites\/([\w-]+)\/builds$/))) {
      state.builds++;
      return { deploy_id: 'd1' };
    }
    if (path === '/deploys/d1') return { id: 'd1', state: 'ready' };
    throw new Error(`the fake Netlify doesn't know ${method} ${path}`);
  };
  return { api, calls, state };
}

describe('spin-up: the site', () => {
  const linkedElsewhere = { id: 'old', name: 'other-project', ssl_url: 'https://other-project.netlify.app', account_id: 'acc', build_settings: { provider: 'github', repo_path: 'engineer-one/other-project', installation_id: 555 } };

  it('creates the site, marks it, and links it through the installation another site of the account shows', async () => {
    const n = fakeNetlify({ sites: [linkedElsewhere] });
    const lines = [];
    const r = await ensureSite(n.api, { project: 'my-project', repository: 'engineer-one/my-project', log: (l) => lines.push(l) });
    assert.equal(r.created, true);
    assert.equal(r.linked, true);
    assert.equal(r.site.build_settings.installation_id, 555);
    assert.equal(n.state.env[`${r.site.id}:HARNESS_REPOSITORY`].values[0].value, 'engineer-one/my-project');
    assert.deepEqual(lines, ['✓ the site: created, https://my-project.netlify.app', '✓ the site builds from engineer-one/my-project, with a deploy preview for every pull request']);
    // A second run finds it and makes nothing.
    const again = [];
    const r2 = await ensureSite(n.api, { project: 'my-project', repository: 'engineer-one/my-project', log: (l) => again.push(l) });
    assert.equal(r2.created, false);
    assert.equal(n.state.sites.length, 2);
    assert.deepEqual(again, ['✓ the site: already there, https://my-project.netlify.app', '✓ the site builds from engineer-one/my-project: already there']);
  });

  it('takes a suffix when Netlify has the name', async () => {
    const n = fakeNetlify();
    const r = await ensureSite(n.api, { project: 'taken', repository: 'o/taken', installation: '7' });
    assert.match(r.site.name, /^taken-[0-9a-f]{4}$/);
  });

  it('without the app, the site is made and the run ends with a Remaining line for the Engineer', async () => {
    const n = fakeNetlify();
    const lines = [];
    const r = await ensureSite(n.api, { project: 'my-project', repository: 'engineer-one/my-project', log: (l) => lines.push(l) });
    assert.equal(r.linked, false);
    assert.match(lines.at(-1), /^Remaining: Netlify's GitHub App isn't installed for engineer-one.*then runs harness infra up my-project, or gives its number with --netlify-installation\.$/);
  });

  it("a site linked to the repository without spin-up's mark is not the project's, and is never deleted", async () => {
    const n = fakeNetlify({ sites: [{ ...linkedElsewhere, id: 'byhand', name: 'my-project', build_settings: { provider: 'github', repo_path: 'engineer-one/my-project' } }] });
    assert.equal(await findSite(n.api, { project: 'my-project', repository: 'engineer-one/my-project' }), undefined);
    const lines = [];
    await deleteSite(n.api, { project: 'my-project', repository: 'engineer-one/my-project', log: (l) => lines.push(l) });
    assert.deepEqual(lines, ['✓ the site: already gone']);
    assert.ok(!n.calls.some((c) => c.startsWith('DELETE')));
  });

  it('teardown deletes the marked site, and refuses one linked to another repository', async () => {
    const n = fakeNetlify({ sites: [linkedElsewhere] });
    await ensureSite(n.api, { project: 'my-project', repository: 'engineer-one/my-project' });
    await deleteSite(n.api, { project: 'my-project', repository: 'engineer-one/my-project' });
    assert.deepEqual(n.state.sites.map((s) => s.id), ['old']);
    // Marked for this repository, but built from another: refused.
    const odd = fakeNetlify({ sites: [{ ...linkedElsewhere, id: 'odd', name: 'my-project' }], env: { 'odd:HARNESS_REPOSITORY': { values: [{ context: 'all', value: 'engineer-one/my-project' }] } } });
    await assert.rejects(deleteSite(odd.api, { project: 'my-project', repository: 'engineer-one/my-project' }), /builds from engineer-one\/other-project, not engineer-one\/my-project: not deleted/);
  });

  it('BACKEND_URL is set for production only, and setting it again changes nothing', async () => {
    const n = fakeNetlify({ sites: [{ id: 's', account_id: 'acc' }] });
    const site = n.state.sites[0];
    assert.equal(await setSiteVariable(n.api, site, 'BACKEND_URL', 'https://b.example', 'production'), true);
    assert.deepEqual(n.state.env['s:BACKEND_URL'], { key: 'BACKEND_URL', scopes: ['builds'], values: [{ context: 'production', value: 'https://b.example' }] });
    assert.equal(await setSiteVariable(n.api, site, 'BACKEND_URL', 'https://b.example', 'production'), false);
  });
});

describe('spin-up: the tailnet', () => {
  const status = (caps, dns = true) => ({ CurrentTailnet: { MagicDNSSuffix: 'example-tailnet.invalid', MagicDNSEnabled: dns }, Self: { CapMap: Object.fromEntries(caps.map((c) => [c, null])) } });

  it('gives the address when MagicDNS, HTTPS and Funnel are on for tag:harness', () => {
    assert.deepEqual(readTailnet(status(['https', 'funnel']), 'my-project'), { address: 'https://my-project.example-tailnet.invalid', missing: [] });
    assert.deepEqual(readTailnet(status(['https://tailscale.com/cap/https', 'https://tailscale.com/cap/funnel']), 'p').missing, []);
  });

  it('says exactly what the Engineer must turn on', () => {
    const { missing } = readTailnet(status(['https'], false), 'p');
    assert.equal(missing.length, 2);
    assert.match(missing[0], /MagicDNS is off/);
    assert.match(missing[1], /"nodeAttrs": \[\{ "target": \["tag:harness"\], "attr": \["funnel"\] \}\]/);
  });
});

// The internet, for the outside checks: a backend as Funnel serves it, and the site.
function fakeInternet({ backendOk = true, cors = true, admin = false, bundle = true, policy = true } = {}) {
  const backend = 'https://my-project.example-tailnet.invalid';
  const res = (status, body = '', headers = {}) => ({ status, ok: status < 400, headers: new Headers(headers), text: async () => body });
  return {
    backend,
    connect: async () => admin,
    fetchImpl: async (url, { headers = {} } = {}) => {
      const u = new URL(url);
      if (u.origin === backend) {
        if (!backendOk) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
        if (u.pathname === '/api/health') return res(200, '{}', cors && headers.Origin === SITE ? { 'access-control-allow-origin': SITE } : {});
        return res(404);
      }
      if (u.pathname === '/') return res(200, '<div id="root"></div><script type="module" src="/assets/index-abc.js"></script>', policy ? { 'content-security-policy': `default-src 'self'; connect-src 'self' ${backend}` } : {});
      if (u.pathname === '/assets/index-abc.js') return res(200, `import("./assets/sync-def.js")`);
      if (u.pathname === '/assets/sync-def.js') return res(200, bundle ? `const b="${backend}"` : 'nothing');
      return res(404);
    },
  };
}

describe('spin-up: the outside checks', () => {
  it('pass for a backend that answers as it must, and name no address', async () => {
    const net = fakeInternet();
    const lines = [...(await checkBackend({ backendUrl: net.backend, siteUrl: SITE, ...net, wait: async () => {} })), ...(await checkSite({ siteUrl: SITE, backendUrl: net.backend, fetchImpl: net.fetchImpl }))];
    assert.equal(lines.length, 8);
    for (const l of lines) assert.doesNotMatch(l, /example-tailnet/);
  });

  for (const [what, opts, reason] of [
    ['a backend the internet cannot reach', { backendOk: false }, /doesn't answer 200 from the internet \(ENOTFOUND\)/],
    ['an admin port that answers', { admin: true }, /the admin port answers from the internet/],
    ['CORS for another origin only', { cors: false }, /CORS doesn't answer the site's origin/],
  ])
    it(`fail for ${what}`, async () => {
      const net = fakeInternet(opts);
      await assert.rejects(checkBackend({ backendUrl: net.backend, siteUrl: SITE, ...net, wait: async () => {}, patience: 2 }), (e) => reason.test(e.message) && !e.message.includes('example-tailnet'));
    });

  it('fail for a site whose headers or bundle lack the backend', async () => {
    for (const [opts, reason] of [[{ policy: false }, /is dist\/_headers served/], [{ bundle: false }, /bundle doesn't hold the backend's address/]]) {
      const net = fakeInternet(opts);
      await assert.rejects(checkSite({ siteUrl: SITE, backendUrl: net.backend, fetchImpl: net.fetchImpl }), reason);
    }
  });
});

describe('spin-up: the jobs', () => {
  it('up-site hands the site on to the next job and records its address, and no token', async () => {
    const dir = tempDir();
    const out = join(dir, 'out');
    write(dir, 'out', '');
    const token = 'nfp_faketoken0123';
    const fetchImpl = async (url, { headers }) => {
      assert.equal(headers.Authorization, `Bearer ${token}`);
      return { ok: false, status: 401, text: async () => JSON.stringify({ message: `bad token ${token}` }) };
    };
    const r = await spinJob('up-site', { PROJECT: 'my-project', REPOSITORY: 'o/my-project', NETLIFY_AUTH_TOKEN: token, GITHUB_OUTPUT: out }, { fetch: fetchImpl });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Netlify answered 401 to GET \/sites: bad token <token>/);
    assert.ok(!JSON.stringify(r).includes(token));
  });

  it('up-address writes the address for the next job only, never into its result', async () => {
    const dir = tempDir();
    const status = write(dir, 'status.json', JSON.stringify({ CurrentTailnet: { MagicDNSSuffix: 'example-tailnet.invalid', MagicDNSEnabled: true }, Self: { CapMap: { https: null, funnel: null } } }));
    const out = write(dir, 'out', '');
    const r = await spinJob('up-address', { PROJECT: 'my-project', TAILSCALE_STATUS: status, GITHUB_OUTPUT: out });
    assert.equal(r.code, 0);
    assert.doesNotMatch(JSON.stringify(r), /example-tailnet/);
    assert.equal(readFileSync(out, 'utf8'), 'backend-url=https://my-project.example-tailnet.invalid\nready=true\n');
  });

  it('teardown jobs refuse a confirmation that is not the name, before anything', async () => {
    for (const kind of ['down-inspect', 'down-site', 'down-backend']) {
      const r = await spinJob(kind, { PROJECT: 'my-project', CONFIRMATION: 'my-projec' }, { connectNas: () => assert.fail('nothing may be reached'), fetch: () => assert.fail('nothing may be reached') });
      assert.equal(r.code, 1, kind);
      assert.match(r.stderr, /the confirmation "my-projec" isn't the project's name: nothing was deleted/);
    }
  });

  it('up-backend, through the NAS client, with the inputs as variables', async () => {
    const nas = fakeNas();
    const env = { PROJECT: 'my-project', REPOSITORY: 'o/my-project', PRIVATE: 'true', SITE_URL: SITE, FUNNEL_PATHS: JSON.stringify(PATHS), TRUENAS_APPS_DATASET: 'tank/apps', GHCR_PULL_TOKEN: PULL, TS_OAUTH_SECRET: 'tskey-client-secret' };
    const r = await spinJob('up-backend', env, { connectNas: async () => nas, createAuthKey: async () => KEY, wait: async () => {} });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /✓ the app: running$/);
    assert.ok(!JSON.stringify(r).includes(PULL) && !JSON.stringify(r).includes(KEY));
  });
});

describe('infra up and down, the commands', () => {
  const env = () => ({ HARNESS_CONFIG_DIR: tempDir(), HARNESS_INFRA_REPO: 'o/infra' });
  const funnel = Buffer.from(JSON.stringify(PATHS)).toString('base64');

  // gh, for the infrastructure repository and the project's, and a run of project-up.yml whose
  // jobs recorded these results.
  function fakeGh({ secrets = ['NETLIFY_AUTH_TOKEN', 'TS_OAUTH_CLIENT_ID', 'TS_OAUTH_SECRET', 'TRUENAS_API_KEY', 'GHCR_PULL_TOKEN'], runner = 'online', funnelJson = funnel, published = true, jobs } = {}) {
    const calls = [];
    let requestId;
    let workflow;
    const gh = (args) => {
      const line = args.join(' ');
      calls.push(line);
      if (args[0] === 'repo' && args[1] === 'view') return JSON.stringify(args[2] === 'o/infra' ? { viewerPermission: 'ADMIN', visibility: 'PRIVATE' } : { visibility: 'PRIVATE' });
      if (line.startsWith('api repos/o/infra/environments/')) return '{}';
      if (line.startsWith('secret list')) return JSON.stringify(secrets.map((name) => ({ name })));
      if (line === 'api repos/o/infra/actions/runners') return JSON.stringify({ runners: [{ id: 1, name: RUNNER_NAME, status: runner, labels: [] }] });
      if (line.startsWith('api repos/o/my-project/contents/backend/funnel.json')) {
        if (!funnelJson) throw new Error('gh api failed: HTTP 404: Not Found');
        return funnelJson;
      }
      if (line.startsWith('run list --repo o/my-project --workflow backend.yml')) return JSON.stringify(published ? [{ databaseId: 1 }] : []);
      if (args[0] === 'workflow' && args[1] === 'run') {
        workflow = args[2];
        requestId = args.find((a) => a.startsWith('request-id=')).slice(11);
        return '';
      }
      if (line.startsWith('run list --repo o/infra')) return JSON.stringify([{ databaseId: 5, displayTitle: `${workflow.replace('.yml', '')} ${requestId}`, status: 'completed', url: 'the-run' }]);
      if (line.startsWith('run view 5')) return JSON.stringify({ status: 'completed', conclusion: 'success', url: 'the-run', jobs: jobs.map((j, i) => ({ databaseId: 10 + i, name: `up / ${j.name}`, conclusion: j.conclusion ?? 'success' })) });
      const m = line.match(/actions\/jobs\/(\d+)\/logs$/);
      if (m) return jobs[Number(m[1]) - 10].result ? resultLines(jobs[Number(m[1]) - 10].result).join('\n') : '';
      throw new Error(`unexpected gh ${line}`);
    };
    return { gh, calls };
  }

  const ok = (stdout, extra = {}) => ({ code: 0, stdout, stderr: '', ...extra });
  const upJobs = [
    { name: 'checks', result: ok("✓ from the internet, the backend answers /api/health with 200\n✓ the production bundle holds the backend's address") },
    { name: 'site', result: ok(`✓ the site: created, ${SITE}`, { site: SITE }) },
    { name: 'address', result: ok("✓ the tailnet: MagicDNS, HTTPS certificates and Funnel for tag:harness are on; the backend's address is known") },
    { name: 'backend', result: ok('✓ the app: running') },
  ];

  it('up starts project-up.yml with the inputs, finds its run by the request id, and prints only the site address', async () => {
    const { gh, calls } = fakeGh({ jobs: upJobs });
    const said = [];
    const code = await main(['up', 'my-project', '--repo', 'o/my-project'], tempDir(), { env: env(), gh, getLogin: () => 'o', log: (m) => said.push(m), wait: async () => {} });
    assert.equal(code, 0, said.join('\n'));
    const start = calls.find((c) => c.startsWith('workflow run project-up.yml'));
    assert.match(start, /^workflow run project-up\.yml --repo o\/infra -f project=my-project -f repository=o\/my-project -f sync=true -f private=true -f funnel-paths=\["\/api\/health","\/api\/collections\/users\/","\/api\/collections\/items\/"\] -f installation-id= -f request-id=[0-9a-f]{16}$/);
    const text = said.join('\n');
    // In job order, whatever order GitHub lists them in.
    assert.ok(text.indexOf('the site: created') < text.indexOf('the tailnet') && text.indexOf('the tailnet') < text.indexOf('the app: running') && text.indexOf('the app: running') < text.indexOf('from the internet'));
    assert.match(text, /^The site: https:\/\/my-project\.netlify\.app$/m);
    assert.match(text, /^Remaining: the backend has no superuser and no user yet\./m);
    assert.equal(said.at(-1), 'Done.');
    // The only address said is the site's.
    assert.deepEqual([...new Set(text.match(/https?:\/\/[^\s,)]+/g))], [SITE]);
  });

  it('up, for a project without a backend: no runner needed, sync=false', async () => {
    const { gh, calls } = fakeGh({ funnelJson: '', runner: 'offline', jobs: [upJobs[1]] });
    const code = await main(['up', 'my-project', '--repo', 'o/my-project'], tempDir(), { env: env(), gh, getLogin: () => 'o', log: () => {}, wait: async () => {} });
    assert.equal(code, 0);
    assert.match(calls.find((c) => c.startsWith('workflow run')), / -f sync=false /);
  });

  it('up stops before starting anything when a secret is missing, the runner is offline, or the image is not published', async () => {
    for (const [opts, reason] of [
      [{ secrets: ['NETLIFY_AUTH_TOKEN'] }, /the environment Prod lacks TS_OAUTH_CLIENT_ID, TS_OAUTH_SECRET, TRUENAS_API_KEY: the Engineer adds them first/],
      [{ runner: 'offline' }, /the runner harness-nas on the NAS is offline/],
      [{ published: false }, /backend image isn't published yet/],
      [{ funnelJson: Buffer.from('["/_/"]').toString('base64') }, /backend\/funnel\.json is refused: .*admin screen/],
    ]) {
      const { gh, calls } = fakeGh({ ...opts, jobs: upJobs });
      const err = [];
      const error = console.error;
      console.error = (m) => err.push(m);
      try {
        assert.equal(await main(['up', 'my-project', '--repo', 'o/my-project'], tempDir(), { env: env(), gh, getLogin: () => 'o', log: () => {}, wait: async () => {} }), 1);
      } finally {
        console.error = error;
      }
      assert.match(err.join('\n'), reason);
      assert.ok(!calls.some((c) => c.startsWith('workflow run')), 'nothing was started');
    }
  });

  it("up goes on without GHCR_PULL_TOKEN, says so, and ends with the backend job's Remaining line", async () => {
    const remaining = 'Remaining: o/my-project is private, so the NAS needs GHCR_PULL_TOKEN to pull its image (G-0030) …';
    const { gh } = fakeGh({ secrets: ['NETLIFY_AUTH_TOKEN', 'TS_OAUTH_CLIENT_ID', 'TS_OAUTH_SECRET', 'TRUENAS_API_KEY'], jobs: [upJobs[1], upJobs[2], { name: 'backend', result: ok(remaining) }, { name: 'checks', conclusion: 'skipped' }] });
    const said = [];
    const code = await main(['up', 'my-project', '--repo', 'o/my-project'], tempDir(), { env: env(), gh, getLogin: () => 'o', log: (m) => said.push(m), wait: async () => {} });
    assert.equal(code, 0);
    assert.match(said.join('\n'), /^! the secret GHCR_PULL_TOKEN isn't there yet/m);
    assert.ok(said.includes(remaining));
    assert.equal(said.at(-1), 'Not finished: see the Remaining lines.');
    assert.doesNotMatch(said.join('\n'), /no superuser/);
  });

  it('up names the failed step and how to look at the run', async () => {
    const { gh } = fakeGh({ jobs: [upJobs[1], { name: 'backend', conclusion: 'failure', result: { code: 1, stdout: '✓ the project\'s dataset: created', stderr: "✗ the app my-project didn't start" } }] });
    const said = [];
    const code = await main(['up', 'my-project', '--repo', 'o/my-project'], tempDir(), { env: env(), gh, getLogin: () => 'o', log: (m) => said.push(m), wait: async () => {} });
    assert.equal(code, 1);
    assert.ok(said.includes("✗ the app my-project didn't start"));
    assert.match(said.at(-1), /^Not finished: fix what failed, then run harness infra up again/);
  });

  it('down without --confirmed lists what would go, exits 2 and starts nothing; with it, it passes the name twice', async () => {
    const { gh, calls } = fakeGh({ jobs: [{ name: 'inspect', result: ok('✓ on the NAS, made by spin-up for my-project: the app, the snapshot task, the dataset') }, { name: 'site', result: ok(`✓ the site ${SITE}: deleted`) }, { name: 'backend', result: ok('✓ the app my-project: deleted') }] });
    const said = [];
    assert.equal(await main(['down', 'my-project', '--repo', 'o/my-project'], tempDir(), { env: env(), gh, getLogin: () => 'o', log: (m) => said.push(m) }), 2);
    assert.match(said.join('\n'), /would delete, for good:[\s\S]*the Netlify site that builds from o\/my-project[\s\S]*the app my-project, its snapshot task, and its dataset[\s\S]*with every snapshot of it[\s\S]*run it again with --confirmed/);
    assert.ok(!calls.some((c) => c.startsWith('workflow')));
    const done = [];
    assert.equal(await main(['down', 'my-project', '--repo', 'o/my-project', '--confirmed'], tempDir(), { env: env(), gh, getLogin: () => 'o', log: (m) => done.push(m), wait: async () => {} }), 0);
    assert.match(calls.find((c) => c.startsWith('workflow run')), /^workflow run project-down\.yml --repo o\/infra -f project=my-project -f repository=o\/my-project -f confirmation=my-project -f request-id=/);
    assert.match(done.join('\n'), /Remaining: what only the Engineer can remove: the machine my-project in the tailnet's admin console, the repository o\/my-project, and its container image o\/my-project-backend\./);
  });

  it('up and down refuse an account that is not the Engineer, before anything', async () => {
    const cwd = tempDir();
    write(cwd, '.harness/engineers', 'the-engineer\n');
    const refusing = () => assert.fail('gh must not be called');
    for (const args of [['up', 'my-project'], ['down', 'my-project'], ['down', 'my-project', '--confirmed']]) {
      const err = [];
      const error = console.error;
      console.error = (m) => err.push(m);
      try {
        assert.equal(await main(args, cwd, { env: env(), gh: refusing, getLogin: () => 'someone-else', log: () => {} }), 1, args.join(' '));
      } finally {
        console.error = error;
      }
      assert.equal(err.join(''), "✗ only the Engineer may change the infrastructure (G-0026): someone-else is not in this project's .harness/engineers");
    }
  });

  it('refuses a name that is not a project name', async () => {
    const error = console.error;
    const err = [];
    console.error = (m) => err.push(m);
    try {
      assert.equal(await main(['up', 'Bad_Name'], tempDir(), { env: env(), getLogin: () => 'o', gh: () => assert.fail('gh') }), 1);
    } finally {
      console.error = error;
    }
    assert.match(err.join(''), /isn't a project name/);
  });
});
