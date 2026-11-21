// The Netlify site of a project (G-0018, G-0028), through Netlify's API. Every function
// takes the API as an argument (`netlify(path, options)`), so the tests run them against a
// fake. The token never leaves `netlifyApi`.
import { randomBytes } from 'node:crypto';
import { SITE_MARK } from './project.mjs';

const API = 'https://api.netlify.com/api/v1';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// A small client: netlify('/sites', { method, body, query }) → the parsed answer. A 404 is
// `undefined` when `missing` is true.
export function netlifyApi(token, fetchImpl = fetch) {
  if (!token) throw new Error('NETLIFY_AUTH_TOKEN is missing from the environment');
  return async (path, { method = 'GET', body, query, missing = false } = {}) => {
    const url = new URL(`${API}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (missing && res.status === 404) return undefined;
    const text = await res.text();
    // Never repeat what Netlify said in full: keep its message only, and never the token.
    if (!res.ok) {
      let message = text;
      try {
        message = JSON.parse(text).message ?? text;
      } catch {
        // Not JSON.
      }
      // Nor the ids in the path: they name the account and the site.
      const where = path.replace(/^\/accounts\/[^/]+/, '/accounts/<account>').replace(/^\/sites\/[^/]+/, '/sites/<site>').replace(/^\/deploys\/[^/]+/, '/deploys/<deploy>');
      throw new HttpError(res.status, `Netlify answered ${res.status} to ${method} ${where}: ${String(message).split(token).join('<token>').slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : undefined;
  };
}

export async function listSites(netlify) {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const sites = await netlify('/sites', { query: { filter: 'all', per_page: 100, page } });
    all.push(...sites);
    if (sites.length < 100) break;
  }
  return all;
}

// The GitHub repository a site builds from, as owner/name, or undefined.
export function linkedRepository(site) {
  const b = site?.build_settings ?? {};
  const path = b.repo_path ?? b.repo_url?.replace(/^https:\/\/github\.com\//i, '').replace(/\.git$/, '');
  return b.provider === 'github' || /github\.com/i.test(b.repo_url ?? '') ? path : undefined;
}

export const siteUrl = (site) => site.ssl_url || site.url;
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

async function accountId(netlify, site) {
  if (site.account_id) return site.account_id;
  const [account] = await netlify('/accounts');
  if (!account) throw new Error('the Netlify token sees no account');
  return account.id;
}

// The value of a site's environment variable, or undefined.
export async function siteVariable(netlify, site, key) {
  const v = await netlify(`/accounts/${await accountId(netlify, site)}/env/${key}`, { query: { site_id: site.id }, missing: true });
  return v?.values?.find((x) => x.context === 'all' || x.context === 'production')?.value;
}

// Sets a site's environment variable for one context ('all' or 'production'). Returns whether
// anything changed. No scopes are given: Netlify's free plan refuses them, and without them a
// variable has all scopes; none of these values is a secret.
export async function setSiteVariable(netlify, site, key, value, context = 'all') {
  const account = await accountId(netlify, site);
  const existing = await netlify(`/accounts/${account}/env/${key}`, { query: { site_id: site.id }, missing: true });
  const wanted = { key, values: [{ context, value }] };
  if (!existing) {
    await netlify(`/accounts/${account}/env`, { method: 'POST', query: { site_id: site.id }, body: [wanted] });
    return true;
  }
  const values = existing.values ?? [];
  if (values.length === 1 && values[0].context === context && values[0].value === value) return false;
  await netlify(`/accounts/${account}/env/${key}`, { method: 'PUT', query: { site_id: site.id }, body: wanted });
  return true;
}

// The site spin-up made for `repository`: it carries the mark and, once linked, builds from
// that repository. A site linked to it without the mark is someone else's.
export async function findSite(netlify, { project, repository }, sites) {
  sites ??= await listSites(netlify);
  const candidates = sites.filter((s) => same(linkedRepository(s), repository) || s.name === project || s.name?.startsWith(`${project}-`));
  for (const s of candidates) if (same(await siteVariable(netlify, s, SITE_MARK), repository)) return s;
  return undefined;
}

// The installation of Netlify's GitHub App that links this account's repositories: given,
// or read from a site of this account that is linked through it.
export function findInstallation(sites, owner, given) {
  if (given) return String(given);
  const linked = sites.find((s) => s.build_settings?.installation_id && same(linkedRepository(s)?.split('/')[0], owner));
  return linked ? String(linked.build_settings.installation_id) : undefined;
}

// Finds the project's site or creates it, and links it to the repository when the app's
// installation is known. Returns { site, created, linked, installation }.
export async function ensureSite(netlify, { project, repository, installation: given, log = () => {} }) {
  const sites = await listSites(netlify);
  let site = await findSite(netlify, { project, repository }, sites);
  let created = false;
  // A run that stopped between creating the site and marking it left an empty site of the
  // project's name: nothing built from anything, never deployed. That one is taken and marked.
  const empty = !site && sites.find((s) => s.name === project && !linkedRepository(s) && !s.published_deploy && !s.build_settings?.repo_url);
  if (site) log(`✓ the site: already there, ${siteUrl(site)}`);
  else if (empty && !(await siteVariable(netlify, empty, SITE_MARK)) && (await netlify(`/sites/${empty.id}/deploys`, { query: { per_page: 1 } })).length === 0) {
    site = empty;
    await setSiteVariable(netlify, site, SITE_MARK, repository);
    log(`✓ the site: already there (empty, now marked), ${siteUrl(site)}`);
  } else {
    // The name is the project's; when Netlify has it already, it gets a short suffix.
    for (let i = 0; i < 4 && !site; i++) {
      const name = i === 0 ? project : `${project}-${randomBytes(2).toString('hex')}`;
      try {
        site = await netlify('/sites', { method: 'POST', body: { name } });
      } catch (e) {
        if (e.status !== 422) throw e;
      }
    }
    if (!site) throw new Error(`Netlify has the name ${project} and every suffix tried`);
    try {
      await setSiteVariable(netlify, site, SITE_MARK, repository);
    } catch (e) {
      // Unmarked, it would never be found again: the site made a moment ago goes.
      await netlify(`/sites/${site.id}`, { method: 'DELETE' }).catch(() => {});
      throw e;
    }
    created = true;
    log(`✓ the site: created, ${siteUrl(site)}`);
  }

  if (same(linkedRepository(site), repository)) {
    log(`✓ the site builds from ${repository}: already there`);
    return { site, created, linked: true };
  }
  const installation = findInstallation(sites, repository.split('/')[0], given);
  if (!installation) {
    log(`Remaining: Netlify's GitHub App isn't installed for ${repository.split('/')[0]}, or no site shows it yet. The Engineer installs it (GitHub, Settings, Applications, Netlify; best for all repositories), then runs harness infra up ${project}, or gives its number with --netlify-installation.`);
    return { site, created, linked: false };
  }
  site = await netlify(`/sites/${site.id}`, {
    method: 'PATCH',
    body: {
      repo: {
        provider: 'github',
        repo_path: repository,
        repo_url: `https://github.com/${repository}`,
        repo_branch: 'main',
        installation_id: Number(installation),
        private: true,
        cmd: 'pnpm run build',
        dir: 'dist',
        allowed_branches: ['main'],
      },
    },
  });
  if (!same(linkedRepository(site), repository)) throw new Error(`Netlify didn't link the site to ${repository}`);
  log(`✓ the site builds from ${repository}, with a deploy preview for every pull request`);
  return { site, created, linked: true, installation };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Starts a production build and waits for its deploy. Returns the deploy.
export async function buildProduction(netlify, site, { wait = sleep, every = 10000, tries = 120 } = {}) {
  const build = await netlify(`/sites/${site.id}/builds`, { method: 'POST', body: {} });
  let deploy = { id: build.deploy_id, state: 'new' };
  for (let i = 0; i < tries && !['ready', 'error'].includes(deploy.state); i++) {
    await wait(every);
    deploy = await netlify(`/deploys/${build.deploy_id}`);
  }
  if (deploy.state !== 'ready') throw new Error(`the production build ended ${deploy.state ?? 'unfinished'}${deploy.error_message ? `: ${deploy.error_message}` : ''}. If Netlify can't read the repository, give its GitHub App access to it`);
  return deploy;
}

// Deletes the project's site, only when it carries the mark and builds from `repository`.
// Returns what it did.
export async function deleteSite(netlify, { project, repository, log = () => {} }) {
  const site = await findSite(netlify, { project, repository });
  if (!site) {
    log('✓ the site: already gone');
    return { deleted: false };
  }
  const linked = linkedRepository(site);
  if (linked && !same(linked, repository)) throw new Error(`the site ${site.name} builds from ${linked}, not ${repository}: not deleted`);
  await netlify(`/sites/${site.id}`, { method: 'DELETE' });
  log(`✓ the site ${siteUrl(site)}: deleted`);
  return { deleted: true, url: siteUrl(site) };
}
