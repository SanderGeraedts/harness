// The jobs of the spin-up and teardown workflows (G-0028), each run as
// `harness infra job <kind>` inside a workflow of the private infrastructure repository.
// The inputs come as environment variables; each job records its result as marker lines for
// the command that started the run, and hands values to the next job through
// $GITHUB_OUTPUT. A job never prints a secret, and only the site job names an address: the
// site's.
import { appendFileSync, readFileSync } from 'node:fs';
import { connectNas, nasEnv } from '../nas-client.mjs';
import { downBackend, inspectBackend, scrub, upBackend } from './backend.mjs';
import { checkBackend, checkSite } from './checks.mjs';
import { buildProduction, deleteSite, ensureSite, findSite, netlifyApi, setSiteVariable, siteUrl } from './netlify.mjs';
import { checkProjectName, checkRepository } from './project.mjs';
import { createAuthKey, readTailnet } from './tailscale.mjs';

export const SPIN_JOBS = ['up-site', 'up-address', 'up-backend', 'up-checks', 'down-inspect', 'down-site', 'down-backend'];

// The order the command prints the jobs' results in.
export const JOB_ORDER = ['site', 'address', 'backend', 'checks', 'inspect'];

const output = (env, values) => {
  if (!env.GITHUB_OUTPUT) return;
  appendFileSync(env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
};

const inputs = (env) => {
  const project = checkProjectName(env.PROJECT);
  return { project, repository: env.REPOSITORY ? checkRepository(env.REPOSITORY) : undefined };
};

// Teardown runs only when the project's name was given twice.
function confirmed(env) {
  if (!env.CONFIRMATION || env.CONFIRMATION !== env.PROJECT) throw new Error(`the confirmation "${env.CONFIRMATION ?? ''}" isn't the project's name: nothing was deleted`);
}

async function withNas(env, deps, fn) {
  const nas = await (deps.connectNas ?? connectNas)(nasEnv(env));
  try {
    return await fn(nas);
  } finally {
    nas.close();
  }
}

// Runs one job. Returns { code, stdout, stderr, site? }.
export async function spinJob(kind, env, deps = {}) {
  const lines = [];
  const log = (l) => lines.push(l);
  const fetchImpl = deps.fetch ?? fetch;
  const secrets = [env.NETLIFY_AUTH_TOKEN, env.TS_OAUTH_SECRET, env.TRUENAS_API_KEY, env.GHCR_PULL_TOKEN];
  let site;
  try {
    if (kind === 'up-site') {
      const { project, repository } = inputs(env);
      const netlify = netlifyApi(env.NETLIFY_AUTH_TOKEN, fetchImpl);
      const r = await ensureSite(netlify, { project, repository, installation: env.INSTALLATION_ID, log });
      site = siteUrl(r.site);
      output(env, { 'site-url': site, linked: String(r.linked) });
    } else if (kind === 'up-address') {
      const { project } = inputs(env);
      const status = JSON.parse(readFileSync(env.TAILSCALE_STATUS, 'utf8'));
      const { address, missing } = readTailnet(status, project);
      for (const m of missing) log(`Remaining: ${m}. Then run harness infra up ${project}.`);
      if (!missing.length) log(`✓ the tailnet: MagicDNS, HTTPS certificates and Funnel for tag:harness are on; the backend's address is known`);
      output(env, { 'backend-url': missing.length ? '' : address, ready: String(!missing.length) });
    } else if (kind === 'up-backend') {
      const { project, repository } = inputs(env);
      const r = await withNas(env, deps, (nas) =>
        upBackend({
          nas,
          project,
          repository,
          isPrivate: env.PRIVATE !== 'false',
          siteUrl: env.SITE_URL,
          paths: JSON.parse(env.FUNNEL_PATHS || '[]'),
          appsDataset: env.TRUENAS_APPS_DATASET,
          pullToken: env.GHCR_PULL_TOKEN,
          createKey: (description) => (deps.createAuthKey ?? createAuthKey)({ clientId: env.TS_OAUTH_CLIENT_ID, clientSecret: env.TS_OAUTH_SECRET, description, fetchImpl }),
          log,
          wait: deps.wait,
          waitOptions: deps.waitOptions,
        }),
      );
      output(env, { ready: String(r.ready) });
    } else if (kind === 'up-checks') {
      const { project, repository } = inputs(env);
      const netlify = netlifyApi(env.NETLIFY_AUTH_TOKEN, fetchImpl);
      const found = await findSite(netlify, { project, repository });
      if (!found) throw new Error("the project's site wasn't found");
      const url = siteUrl(found);
      const backendUrl = env.SYNC === 'true' ? env.BACKEND_URL : '';
      if (env.SYNC === 'true' && !backendUrl) throw new Error("the backend's address is missing: the address job didn't finish");
      if (backendUrl) for (const l of await checkBackend({ backendUrl, siteUrl: url, fetchImpl, connect: deps.connect, wait: deps.wait, patience: deps.patience })) log(l);
      // G-0019: production only; previews and branch deploys get nothing.
      const changed = backendUrl ? await setSiteVariable(netlify, found, 'BACKEND_URL', backendUrl, 'production') : false;
      if (backendUrl) log(`✓ BACKEND_URL on the site, for production only: ${changed ? 'set' : 'already there'}`);
      if (changed || !found.published_deploy) {
        await buildProduction(netlify, found, { wait: deps.wait });
        log('✓ the production build: done');
      } else log('✓ the production build: already there');
      for (const l of await checkSite({ siteUrl: url, backendUrl, fetchImpl })) log(l);
    } else if (kind === 'down-inspect') {
      confirmed(env);
      const { project } = inputs(env);
      const r = await withNas(env, deps, (nas) => inspectBackend({ nas, project, appsDataset: env.TRUENAS_APPS_DATASET }));
      log(`✓ on the NAS, made by spin-up for ${project}: ${[r.app && 'the app', r.tasks.length && 'the snapshot task', r.dataset && 'the dataset'].filter(Boolean).join(', ') || 'nothing'}`);
    } else if (kind === 'down-site') {
      confirmed(env);
      const { project, repository } = inputs(env);
      await deleteSite(netlifyApi(env.NETLIFY_AUTH_TOKEN, fetchImpl), { project, repository, log });
    } else if (kind === 'down-backend') {
      confirmed(env);
      const { project } = inputs(env);
      await withNas(env, deps, (nas) => downBackend({ nas, project, appsDataset: env.TRUENAS_APPS_DATASET, log }));
    } else throw new Error(`harness infra job ${SPIN_JOBS.join(' | ')}, not "${kind ?? ''}"`);
    return { code: 0, stdout: scrub(lines.join('\n'), secrets), stderr: '', ...(site ? { site } : {}) };
  } catch (e) {
    return { code: 1, stdout: scrub(lines.join('\n'), secrets), stderr: `✗ ${scrub(e.message, secrets)}` };
  }
}
