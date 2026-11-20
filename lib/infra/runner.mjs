// The self-hosted GitHub Actions runner, as a custom app on the NAS (G-0027). It is
// registered to the private infrastructure repository only, labelled `harness-nas`, and has
// its own dataset for its registration, no container socket and no other dataset.
//
// Its app configuration carries the NAS's address, the certificate's fingerprint and the
// parent dataset for apps, for the jobs that run on it. The registration token is in it only
// until the runner is online; then the app is updated without it.

// The official runner image, at a pinned version; bumped by pull request. The runner updates
// itself inside the container when GitHub asks it to.
export const RUNNER_IMAGE = 'ghcr.io/actions/actions-runner:2.338.2';
export const RUNNER_APP = 'harness-runner';
export const RUNNER_NAME = 'harness-nas';
export const RUNNER_LABEL = 'harness-nas';
export const RUNNER_DATASET = 'harness-runner';
const STATE = '/state';
const FILES = ['.runner', '.credentials', '.credentials_rsaparams'];

// Runs as root only to hand its dataset to the runner user, then drops to that user. The
// registration lives on the dataset: on a later start the runner comes back without a token.
// `$$` is how a compose file writes a `$`.
export const ENTRYPOINT = [
  'set -eu',
  `chown runner:runner ${STATE}`,
  'cd /home/runner',
  `if [ -f ${STATE}/.runner ]; then`,
  `  cp ${FILES.map((f) => `${STATE}/${f}`).join(' ')} /home/runner/`,
  '  chown runner:runner .runner .credentials .credentials_rsaparams',
  'else',
  '  if [ -z "$${RUNNER_TOKEN:-}" ]; then echo "Not registered, and no registration token: run harness infra runner install." >&2; exit 1; fi',
  '  setpriv --reuid=runner --regid=runner --init-groups ./config.sh --unattended --replace --url "$$RUNNER_URL" --token "$$RUNNER_TOKEN" --name "$$RUNNER_NAME" --labels "$$RUNNER_LABELS" --work _work',
  `  cp ${FILES.join(' ')} ${STATE}/`,
  'fi',
  'unset RUNNER_TOKEN',
  'exec setpriv --reuid=runner --regid=runner --init-groups ./run.sh',
].join('\n');

// The compose configuration of the runner app. `token` only for the first start.
export function runnerCompose({ repo, host, pin, appsDataset, mountpoint, token }) {
  for (const [name, value] of Object.entries({ repo, host, pin, appsDataset, mountpoint }))
    if (!value) throw new Error(`the runner's configuration needs ${name}`);
  const environment = {
    HOME: '/home/runner',
    RUNNER_URL: `https://github.com/${repo}`,
    RUNNER_NAME,
    RUNNER_LABELS: RUNNER_LABEL,
    // For the jobs: harness nas reads these, and the key comes from the GitHub environment.
    TRUENAS_HOST: host,
    TRUENAS_CERT_SHA256: pin,
    TRUENAS_APPS_DATASET: appsDataset,
  };
  if (token) environment.RUNNER_TOKEN = token;
  return {
    services: {
      runner: {
        image: RUNNER_IMAGE,
        restart: 'unless-stopped',
        user: '0:0',
        entrypoint: ['/bin/bash', '-c', ENTRYPOINT],
        environment,
        volumes: [`${mountpoint}:${STATE}`],
      },
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The runner as GitHub sees it: { status, labels } or undefined.
export function findRunner(repo, gh) {
  const { runners = [] } = JSON.parse(gh(['api', `repos/${repo}/actions/runners`]));
  const r = runners.find((x) => x.name === RUNNER_NAME);
  return r && { id: r.id, status: r.status, busy: r.busy, labels: r.labels.map((l) => l.name) };
}

export async function waitOnline(repo, gh, { wait = sleep, tries = 60, every = 5000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = findRunner(repo, gh);
    if (r?.status === 'online') return r;
    await wait(every);
  }
  throw new Error(`the runner ${RUNNER_NAME} did not come online on ${repo}; look at the ${RUNNER_APP} app's logs on the NAS`);
}

// JSON with sorted keys, to compare two configurations.
export const canonical = (value) =>
  JSON.stringify(value, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

// Removes a secret from a text, so an error message can be shown.
const scrub = (text, secret) => (secret ? String(text).split(secret).join('<token>') : String(text));

// Installs (or repairs) the runner. `nas` is a signed-in NAS client, `gh` runs gh and
// returns its output. Logs one ✓ line per step. The registration token goes from gh to the
// NAS inside this process: never to the log, a file or a command line.
export async function installRunner({ repo, nas, gh, host, pin, appsDataset, log = console.log, wait = sleep, waitOptions = {} }) {
  if (!appsDataset) throw new Error('Set TRUENAS_APPS_DATASET: the parent dataset for apps on the NAS.');
  const datasetName = `${appsDataset}/${RUNNER_DATASET}`;

  const [parent] = await nas.call('pool.dataset.query', [[['id', '=', appsDataset]]]);
  if (!parent) throw new Error('TRUENAS_APPS_DATASET names no dataset on the NAS');
  let [dataset] = await nas.call('pool.dataset.query', [[['id', '=', datasetName]]]);
  if (dataset) log("✓ the runner's dataset: already there");
  else {
    dataset = await nas.call('pool.dataset.create', [{ name: datasetName, user_properties: [{ key: 'harness:runner', value: repo }] }]);
    log("✓ the runner's dataset: created");
  }
  const mountpoint = dataset.mountpoint;
  if (!mountpoint) throw new Error("the runner's dataset has no mountpoint");

  const config = { repo, host, pin, appsDataset, mountpoint };
  const [app] = await nas.call('app.query', [[['name', '=', RUNNER_APP]]]);
  const online = findRunner(repo, gh)?.status === 'online';

  if (app && online) {
    // Bring the configuration up to date (image, settings); the registration is kept.
    const wanted = runnerCompose(config);
    if (canonical(await nas.call('app.config', [RUNNER_APP])) === canonical(wanted)) {
      log('✓ the runner app: already there, nothing changed');
    } else {
      await nas.job('app.update', [RUNNER_APP, { custom_compose_config: wanted }]);
      log('✓ the runner app: already there, configuration updated');
    }
    const r = await waitOnline(repo, gh, { wait, ...waitOptions });
    log(`✓ the runner ${RUNNER_NAME}: ${r.status}`);
    return { created: false };
  }

  // A new registration: a token valid for an hour, held only in memory.
  const token = JSON.parse(gh(['api', '-X', 'POST', `repos/${repo}/actions/runners/registration-token`])).token;
  if (!token) throw new Error('GitHub gave no registration token');
  try {
    const compose = runnerCompose({ ...config, token });
    if (app) await nas.job('app.update', [RUNNER_APP, { custom_compose_config: compose }]);
    else await nas.job('app.create', [{ app_name: RUNNER_APP, custom_app: true, custom_compose_config: compose }]);
    log(`✓ the runner app: ${app ? 'updated with a new registration' : 'created'}`);
    const r = await waitOnline(repo, gh, { wait, ...waitOptions });
    log(`✓ the runner ${RUNNER_NAME}: ${r.status}, labels ${r.labels.join(', ')}`);
  } catch (e) {
    // Never let the token out, whatever the NAS put in its error.
    const err = new Error(scrub(e.message, token));
    if (e.detail) err.detail = JSON.parse(scrub(JSON.stringify(e.detail), token));
    throw err;
  } finally {
    // Drop the token from the app's configuration, also when the runner didn't come up.
    try {
      await nas.job('app.update', [RUNNER_APP, { custom_compose_config: runnerCompose(config) }]);
    } catch {
      // The app may not exist when its creation failed.
    }
  }
  log("✓ the registration token: removed from the app's configuration");
  const r = await waitOnline(repo, gh, { wait, ...waitOptions });
  log(`✓ the runner ${RUNNER_NAME}: ${r.status} after a restart without the token`);
  return { created: true };
}
