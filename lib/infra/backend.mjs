// A project's backend on the NAS (G-0018, G-0023, G-0027, G-0030), through the NAS client:
// its dataset, its snapshot task, the pull token for a private image, and its app. Run by
// the `backend` job of the spin-up workflow on the runner on the NAS; teardown is here too.
// Every step first looks for what is there and says "already there" instead of making a
// second one.
import { canonical } from './runner.mjs';
import { LABEL, MARK, REGISTRY_NAME, SNAPSHOTS, backendCompose, checkFunnelPaths, madeFor, userProperty } from './project.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Removes secrets from a text, so an error can be shown.
export const scrub = (text, secrets) => secrets.filter(Boolean).reduce((t, s) => t.split(s).join('<secret>'), String(text));

export const datasetName = (appsDataset, project) => `${appsDataset}/${project}`;

async function query(nas, method, filters) {
  return nas.call(method, [filters]);
}

// The project's dataset, or undefined. Throws when one of that name exists without the mark.
export async function projectDataset(nas, appsDataset, project) {
  const [dataset] = await query(nas, 'pool.dataset.query', [['id', '=', datasetName(appsDataset, project)]]);
  if (dataset && userProperty(dataset, MARK) !== project)
    throw new Error(`a dataset named ${project} exists under the parent dataset for apps that spin-up didn't make (it has no ${MARK}=${project}): nothing was changed`);
  return dataset;
}

// The project's app, or undefined. Throws when one of that name exists that spin-up didn't make.
export async function projectApp(nas, project) {
  const [app] = await query(nas, 'app.query', [['name', '=', project]]);
  if (!app) return undefined;
  const config = await nas.call('app.config', [project]);
  if (!madeFor(config, project)) throw new Error(`an app named ${project} exists on the NAS that spin-up didn't make (no ${LABEL} label): nothing was changed`);
  return { app, config };
}

async function waitRunning(nas, project, { wait = sleep, tries = 60, every = 5000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const [app] = await query(nas, 'app.query', [['name', '=', project]]);
    if (app?.state === 'RUNNING') return app;
    if (app?.state === 'CRASHED') break;
    await wait(every);
  }
  throw new Error(`the app ${project} didn't start; look at its containers' logs on the NAS`);
}

// Sets the backend up. `env` holds the inputs; `tailscale.createKey` makes an auth key.
// Returns { lines, ready }: `ready` is false when a human step is missing (a `Remaining:` line).
export async function upBackend({ nas, project, repository, isPrivate, siteUrl, paths, appsDataset, pullToken, createKey, log = () => {}, wait = sleep, waitOptions = {} }) {
  if (!appsDataset) throw new Error("the runner's configuration lacks TRUENAS_APPS_DATASET: run harness infra runner install");
  if (!siteUrl) throw new Error("the site's address is missing: the site job didn't finish");
  checkFunnelPaths(paths);
  const name = datasetName(appsDataset, project);

  // 1. The dataset and its two children.
  const [parent] = await query(nas, 'pool.dataset.query', [['id', '=', appsDataset]]);
  if (!parent) throw new Error('the parent dataset for apps in the runner\'s configuration names no dataset');
  let dataset = await projectDataset(nas, appsDataset, project);
  if (dataset) log("✓ the project's dataset: already there");
  else {
    dataset = await nas.call('pool.dataset.create', [{ name, type: 'FILESYSTEM', user_properties: [{ key: MARK, value: project }] }]);
    log(`✓ the project's dataset: created, marked ${MARK}=${project}`);
  }
  for (const child of ['pb_data', 'tailscale']) {
    const [found] = await query(nas, 'pool.dataset.query', [['id', '=', `${name}/${child}`]]);
    if (!found) await nas.call('pool.dataset.create', [{ name: `${name}/${child}`, type: 'FILESYSTEM' }]);
  }
  log('✓ its datasets pb_data and tailscale: there');
  const mountpoint = dataset.mountpoint;
  if (!mountpoint) throw new Error("the project's dataset has no mountpoint");

  // 2. The snapshot task (G-0023), before any data exists, and a first snapshot.
  const tasks = await query(nas, 'pool.snapshottask.query', [['dataset', '=', name]]);
  if (tasks.length) log('✓ the snapshot task: already there');
  else {
    const task = await nas.call('pool.snapshottask.create', [{ dataset: name, recursive: true, enabled: true, allow_empty: true, ...SNAPSHOTS }]);
    await nas.call('pool.snapshottask.run', [task.id]);
    log('✓ the snapshot task: created, every hour, each kept two weeks; a first snapshot started');
  }

  // 3. The pull token for a private image (G-0030).
  if (isPrivate) {
    if (!pullToken) {
      log(`Remaining: ${repository} is private, so the NAS needs GHCR_PULL_TOKEN to pull its image (G-0030), and the environment has none. The Engineer makes a token that may only read packages and adds it as the secret GHCR_PULL_TOKEN, then runs harness infra up ${project}.`);
      return { ready: false };
    }
    const [registry] = await query(nas, 'app.registry.query', [['name', '=', REGISTRY_NAME]]);
    const entry = { name: REGISTRY_NAME, description: 'Pulls private backend images (harness, G-0030)', username: repository.split('/')[0], password: pullToken, uri: 'ghcr.io' };
    if (registry) await nas.call('app.registry.update', [registry.id, entry]);
    else await nas.call('app.registry.create', [entry]);
    log(`✓ the NAS may pull private images from ghcr.io: ${registry ? 'already there' : 'set up'}`);
  }

  // 4. The app; 5. without the auth key once it runs.
  const config = { project, repository, siteOrigin: siteUrl, mountpoint, paths, pullToken: isPrivate ? pullToken : undefined };
  const wanted = backendCompose(config);
  const existing = await projectApp(nas, project);
  if (existing) {
    if (canonical(existing.config) === canonical(wanted)) log('✓ the app: already there, nothing changed');
    else {
      await nas.job('app.update', [project, { custom_compose_config: wanted }]);
      log('✓ the app: already there, configuration updated');
    }
    await waitRunning(nas, project, { wait, ...waitOptions });
    log('✓ the app: running');
    return { ready: true };
  }
  const key = await createKey(`harness ${project}`);
  try {
    await nas.job('app.create', [{ app_name: project, custom_app: true, custom_compose_config: backendCompose({ ...config, authKey: key }) }]);
    log('✓ the app: created, with a one-use auth key for tag:harness');
    await waitRunning(nas, project, { wait, ...waitOptions });
  } catch (e) {
    throw new Error(scrub(e.message, [key, pullToken]));
  } finally {
    // The login is in the tailscale dataset by now; the key goes, also when the app didn't start.
    try {
      if ((await query(nas, 'app.query', [['name', '=', project]])).length) await nas.job('app.update', [project, { custom_compose_config: wanted }]);
    } catch {
      // Reported by the next run.
    }
  }
  log("✓ the auth key: removed from the app's configuration");
  await waitRunning(nas, project, { wait, ...waitOptions });
  log('✓ the app: running');
  return { ready: true };
}

// What teardown would find on the NAS, refusing anything spin-up didn't make. Returns
// { dataset, app, tasks }.
export async function inspectBackend({ nas, project, appsDataset }) {
  if (!appsDataset) throw new Error("the runner's configuration lacks TRUENAS_APPS_DATASET");
  const dataset = await projectDataset(nas, appsDataset, project);
  if (dataset && dataset.id !== datasetName(appsDataset, project)) throw new Error('the dataset found is not directly under the parent dataset for apps');
  const found = await projectApp(nas, project);
  const tasks = dataset ? await query(nas, 'pool.snapshottask.query', [['dataset', '=', dataset.id]]) : [];
  return { dataset, app: found?.app, tasks };
}

// Teardown on the NAS, in order: the app, the snapshot task, the dataset with every snapshot.
export async function downBackend({ nas, project, appsDataset, log = () => {} }) {
  const { dataset, app, tasks } = await inspectBackend({ nas, project, appsDataset });
  if (app) {
    await nas.job('app.delete', [project, { remove_images: true, remove_ix_volumes: false }]);
    log(`✓ the app ${project}: deleted`);
  } else log('✓ the app: already gone');
  for (const t of tasks) await nas.call('pool.snapshottask.delete', [t.id]);
  log(tasks.length ? '✓ the snapshot task: deleted' : '✓ the snapshot task: already gone');
  if (dataset) {
    await nas.call('pool.dataset.delete', [dataset.id, { recursive: true, force: true }]);
    log("✓ the project's dataset, with every snapshot of it: deleted");
  } else log("✓ the project's dataset: already gone");
}
