// The outside checks of a spun-up project (G-0018, G-0019), from a machine that is not on
// the tailnet: what the internet reaches of the backend, and that only the production build
// of the site knows its address. Every network call goes through `fetchImpl` and `connect`,
// so the tests run them against fakes. No line names the backend's address.
import { connect as tlsConnect } from 'node:tls';
import { ADMIN_PORT } from './project.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Whether anything answers TLS on host:port within `timeout`.
export function tlsAnswers(host, port, { timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    const socket = tlsConnect({ host, port, servername: host, timeout });
    const done = (v) => {
      socket.destroy();
      resolve(v);
    };
    socket.once('secureConnect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

// The checks of the backend from outside. Returns the lines; throws on the first that fails.
// A new Funnel name can take minutes to be reachable: up to `patience` tries for the first.
export async function checkBackend({ backendUrl, siteUrl, fetchImpl = fetch, connect = tlsAnswers, wait = sleep, patience = 60, every = 10000 }) {
  const lines = [];
  const site = new URL(siteUrl).origin;
  const get = (path, headers = {}) => fetchImpl(new URL(path, backendUrl), { headers, redirect: 'manual' });

  let health;
  let lastError = '';
  for (let i = 0; i < patience; i++) {
    try {
      health = await get('/api/health');
      if (health.status === 200) break;
      lastError = `answered ${health.status}`;
    } catch (e) {
      lastError = e.cause?.code ?? e.message;
    }
    await wait(every);
  }
  if (health?.status !== 200) throw new Error(`the backend's /api/health doesn't answer 200 from the internet (${lastError}). Is Funnel allowed for tag:harness, and is the app running?`);
  lines.push('✓ from the internet, the backend answers /api/health with 200');

  for (const [path, what] of [['/_/', 'the admin screen'], ['/api/collections/_superusers/auth-with-password', 'the superuser sign-in']]) {
    const res = await get(path);
    if (res.status !== 404) throw new Error(`${what} answers ${res.status} from the internet, not 404`);
    lines.push(`✓ ${what} answers 404 from the internet`);
  }

  if (await connect(new URL(backendUrl).hostname, ADMIN_PORT)) throw new Error(`the admin port answers from the internet`);
  lines.push("✓ the admin port doesn't answer from the internet");

  const allowed = (await get('/api/health', { Origin: site })).headers.get('access-control-allow-origin');
  if (allowed !== site) throw new Error(`CORS doesn't answer the site's origin (it gave ${allowed ?? 'nothing'}): the address may lead to another project's backend`);
  const other = (await get('/api/health', { Origin: 'https://another-origin.invalid' })).headers.get('access-control-allow-origin');
  if (other === '*' || other === 'https://another-origin.invalid') throw new Error('CORS answers an origin that is not the site');
  lines.push("✓ CORS answers the site's origin, and no other");
  return lines;
}

// The site, after a production build: it serves the app, its policy lets it reach the
// backend, and its bundle holds the backend's address. Returns the lines.
export async function checkSite({ siteUrl, backendUrl, fetchImpl = fetch }) {
  const lines = [];
  const res = await fetchImpl(siteUrl);
  const html = await res.text();
  if (res.status !== 200 || !/<div id="root">/.test(html)) throw new Error(`the site doesn't serve the app (${res.status})`);
  lines.push('✓ the site serves the app');
  if (!backendUrl) return lines;

  const backend = new URL(backendUrl).origin;
  const policy = res.headers.get('content-security-policy') ?? '';
  const connectSrc = policy.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src')) ?? '';
  if (!connectSrc.split(/\s+/).includes(backend)) throw new Error(`the site's content security policy doesn't let it reach the backend (connect-src is "${connectSrc.replaceAll(backend, '<backend>')}"): is dist/_headers served?`);
  lines.push("✓ the site's headers (dist/_headers) let it reach the backend, and only production's do");

  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => new URL(m[1], siteUrl).href);
  let found = false;
  for (const src of scripts) {
    const js = await (await fetchImpl(src)).text();
    if (js.includes(new URL(backendUrl).host)) found = true;
    // A lazily loaded chunk may hold it instead.
    for (const m of js.matchAll(/["'(]\.?\/?(assets\/[\w.-]+\.js)["')]/g)) {
      if (found) break;
      const chunk = await (await fetchImpl(new URL(`/${m[1]}`, siteUrl))).text();
      if (chunk.includes(new URL(backendUrl).host)) found = true;
    }
    if (found) break;
  }
  if (!found) throw new Error("the production bundle doesn't hold the backend's address");
  lines.push("✓ the production bundle holds the backend's address");
  return lines;
}
