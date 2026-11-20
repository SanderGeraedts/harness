// harness infra: the Engineer's private infrastructure repository and the runner on the NAS
// (G-0026, G-0027). Only the Engineer runs these; see lib/infra/access.mjs.
//
//   harness infra init [--repo owner/name] [--environment <name>] [--harness-ref <ref>]
//   harness infra init --dir <folder> [--environment <name>] [--harness-ref <ref>]
//   harness infra check
//   harness infra runner install
//   harness infra runner status
//
// And, inside a workflow on the runner (the reusable infra-*.yml workflows):
//
//   harness infra job nas | check
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { NasError, connectNas, nasEnv } from './nas-client.mjs';
import { parseNasArgs, report, runLocal } from './nas.mjs';
import { harnessVersion } from './paths.mjs';
import { ghLogin } from './role.mjs';
import { requireAdmin, requireListedEngineer, viewRepo } from './infra/access.mjs';
import { LATER_SECRETS, SECRETS, infraFiles } from './infra/callers.mjs';
import { resultLines, runWorkflow } from './infra/remote.mjs';
import { checkFunnelPaths, checkProjectName, checkRepository } from './infra/project.mjs';
import { RUNNER_NAME, findRunner, installRunner } from './infra/runner.mjs';
import { infraSettings, readSettings, writeSettings } from './infra/settings.mjs';
import { JOB_ORDER, SPIN_JOBS, spinJob } from './infra/spinup.mjs';

export const USAGE = `harness infra <command>

  init [--repo owner/name] [--environment <name>] [--harness-ref <ref>]
                     generate the private infrastructure repository's files, and check its
                     environment and secrets by name; --repo is remembered on this machine
  init --dir <folder>
                     only write the files into a folder; touches nothing on GitHub
  check              start the check workflow there and print what it found
  runner install     install the runner on the NAS (at home, with the NAS's settings in the
                     environment: TRUENAS_HOST, TRUENAS_API_KEY, TRUENAS_CERT_SHA256 and
                     TRUENAS_APPS_DATASET)
  runner status      print whether the runner is online
  up <project> [--repo owner/name] [--netlify-installation <id>]
                     spin up the project's hosting and, when it syncs, its backend; run it
                     again to finish or repair; --repo defaults to <your account>/<project>
  down <project> [--repo owner/name] [--confirmed]
                     remove the project's site, backend app, snapshot task and dataset with
                     every snapshot; without --confirmed it only lists what would go
`;

// gh, returning its output; throws with what it said.
export function gh(args, { input, cwd } = {}) {
  try {
    return execFileSync('gh', args, { cwd, input, encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${String(e.stderr || e.message).trim()}`);
  }
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim()}`);
  return r.stdout;
}

const VALUE_FLAGS = ['repo', 'environment', 'dir', 'harness-ref', 'netlify-installation'];

export function parseInfraArgs(args) {
  const o = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      o.positional.push(a);
      continue;
    }
    if (a === '--confirmed') {
      o.confirmed = true;
      continue;
    }
    const [flag, inline] = a.slice(2).split(/=(.*)/s);
    if (!VALUE_FLAGS.includes(flag)) throw new Error(`unknown option --${flag}`);
    const v = inline ?? args[++i];
    if (v === undefined || (inline === undefined && v.startsWith('--'))) throw new Error(`--${flag} needs a value`);
    o[flag.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
  }
  return o;
}

const harnessRefOf = (o) => {
  const ref = o.harnessRef ?? `v${harnessVersion()}`;
  if (!/^[\w./-]+$/.test(ref)) throw new Error(`"${ref}" isn't a tag, branch or commit`);
  return ref;
};

// Writes the generated files into `dir`; returns their paths.
export function writeInfraFiles(dir, { ref, environment }) {
  const files = infraFiles({ ref, environment });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return Object.keys(files);
}

// Who may: the listed Engineer with admin rights on the repository. Returns { login, repo,
// environment, found }.
// `reads`: the command only looks (status, check), which the refusal says.
function access({ cwd, env, deps, given = {}, mayCreate = false, reads = false }) {
  const login = requireListedEngineer({ cwd, getLogin: deps.getLogin ?? ghLogin, reads });
  const { repo, environment } = infraSettings(given, env);
  const run = deps.gh ?? gh;
  if (mayCreate && !viewRepo(repo, run)) {
    if (repo.split('/')[0].toLowerCase() !== login.toLowerCase())
      throw new Error(`only the Engineer may change the infrastructure (G-0026): ${login} can't see ${repo}, and it can only be created under ${login}`);
    return { login, repo, environment, found: undefined };
  }
  return { login, repo, environment, found: requireAdmin({ repo, login, gh: run, reads }) };
}

async function init(o, { cwd, env, deps, log }) {
  const ref = harnessRefOf(o);
  if (o.dir) {
    const { environment } = infraSettings({ repo: 'x/x', environment: o.environment }, env);
    const dir = resolve(cwd, o.dir);
    for (const f of writeInfraFiles(dir, { ref, environment })) log(`✓ wrote ${f}`);
    log(`Wrote the infrastructure repository's files into ${dir}, pinned to harness ${ref}, environment ${environment}. Nothing on GitHub was touched.`);
    return 0;
  }

  const run = deps.gh ?? gh;
  const { login, repo, environment, found } = access({ cwd, env, deps, given: o, mayCreate: true });
  let isEmpty = found?.isEmpty;
  if (!found) {
    run(['repo', 'create', repo, '--private', '--description', "The Engineer's infrastructure: generated by harness infra init"]);
    isEmpty = true;
    log(`✓ created ${repo} (private)`);
  } else log(`✓ the repository ${repo}: private, ${login} is admin`);
  if (o.repo) log(`✓ remembered ${repo} in ${writeSettings({ repo, environment }, env)}`);

  // The files: a first commit into an empty repository, otherwise a pull request.
  const work = mkdtempSync(join(tmpdir(), 'harness-generated-'));
  const credentials = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];
  try {
    const url = deps.remoteUrl?.(repo) ?? `https://github.com/${repo}.git`;
    // The files are written as generated, byte for byte, whatever git does with line endings
    // on this machine.
    const lf = ['-c', 'core.autocrlf=false'];
    if (isEmpty) {
      git(['init', '-q', '-b', 'main'], work);
      writeInfraFiles(work, { ref, environment });
      git([...lf, 'add', '-A'], work);
      git(['commit', '-q', '-m', `Generate the infrastructure workflows (harness ${ref})`], work);
      git([...credentials, 'push', '-q', url, 'main'], work);
      log(`✓ files: the first commit on main, pinned to harness ${ref}`);
    } else {
      git([...credentials, ...lf, 'clone', '-q', '--depth', '1', url, '.'], work);
      const generated = writeInfraFiles(work, { ref, environment });
      git([...lf, 'add', '-A'], work);
      if (!git([...lf, 'diff', '--cached', '--name-only'], work).trim()) log(`✓ files: nothing changed (harness ${ref})`);
      else {
        const branch = `harness-generated-${ref.replace(/[^\w.-]/g, '-')}-${Date.now().toString(36)}`;
        git(['checkout', '-q', '-b', branch], work);
        git(['commit', '-q', '-m', `Regenerate the infrastructure workflows (harness ${ref})`], work);
        git([...credentials, 'push', '-q', url, branch], work);
        const pr = run(['pr', 'create', '--repo', repo, '--head', branch, '--title', `Regenerate the infrastructure workflows (harness ${ref})`, '--body', 'Generated by harness infra init. Every file in this pull request is generated.']).trim().split('\n').pop();
        const changed = run(['pr', 'diff', pr, '--repo', repo, '--name-only']).split('\n').map((l) => l.trim()).filter(Boolean);
        const other = changed.filter((f) => !generated.includes(f));
        if (other.length) log(`! files: ${pr} also changes ${other.join(', ')}; merge it yourself after reading it`);
        else {
          run(['pr', 'merge', pr, '--repo', repo, '--squash', '--delete-branch']);
          log(`✓ files: updated and merged through ${pr}, pinned to harness ${ref}`);
        }
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 3 });
  }

  let ready = checkEnvironment({ repo, environment, gh: run, log });
  const runner = findRunner(repo, run);
  if (runner?.status === 'online') log(`✓ the runner ${RUNNER_NAME}: online`);
  else {
    ready = false;
    log(`! Remaining: the runner on the NAS is ${runner ? runner.status : 'not installed'}: at home, run harness infra runner install`);
  }

  const interactive = deps.interactive ?? (process.stdin.isTTY && process.stdout.isTTY);
  if (ready && interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question('Start the check workflow now, to prove the whole chain? [y/N] ')).trim();
    rl.close();
    if (/^y/i.test(answer)) return check({ cwd, env, deps, log });
  } else if (ready) log('Next: prove the whole chain with harness infra check');
  return 0;
}

// The environment and its secrets, by name only. Returns whether everything required is there.
export function checkEnvironment({ repo, environment, gh: run, log }) {
  try {
    run(['api', `repos/${repo}/environments/${encodeURIComponent(environment)}`]);
  } catch {
    log(`! Remaining: ${repo} has no environment ${environment}; the Engineer creates it, with the secrets ${SECRETS.join(', ')}`);
    return false;
  }
  log(`✓ the environment ${environment}`);
  const names = new Set(JSON.parse(run(['secret', 'list', '--repo', repo, '--env', environment, '--json', 'name'])).map((s) => s.name));
  let all = true;
  for (const s of SECRETS) {
    if (names.has(s)) log(`✓ the secret ${s}`);
    else {
      all = false;
      log(`! Remaining: the secret ${s} is missing from the environment ${environment}; the Engineer adds it`);
    }
  }
  for (const [s, why] of Object.entries(LATER_SECRETS))
    log(names.has(s) ? `✓ the secret ${s}` : `· the secret ${s} isn't there yet: needed ${why}`);
  return all;
}

// Starts a workflow and prints what its job recorded. Returns the exit code.
async function startAndReport({ repo, workflow, inputs, deps, log }) {
  const { run, result } = await runWorkflow({ repo, workflow, inputs, gh: deps.gh ?? gh, wait: deps.wait, log: deps.verbose ? log : () => {}, ...(deps.remoteOptions ?? {}) });
  if (!result) {
    console.error(`✗ the ${workflow} run ended ${run.conclusion} without a result: ${run.url}`);
    return 1;
  }
  return report(result);
}

async function check({ cwd, env, deps, log }) {
  const { repo } = access({ cwd, env, deps, reads: true });
  log(`Starting check.yml on ${repo}…`);
  return startAndReport({ repo, workflow: 'check.yml', inputs: {}, deps, log });
}

// harness nas --remote: `o` from parseNasArgs, already past the destructive check.
export async function remoteNas(o, { env = process.env, cwd = process.cwd(), ...deps } = {}) {
  try {
    const { repo } = access({ cwd, env, deps });
    return await startAndReport({
      repo,
      workflow: 'nas.yml',
      inputs: { method: o.method, params: JSON.stringify(o.params), job: String(o.job), confirmed: String(o.confirmed) },
      deps,
      log: console.log,
    });
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 1;
  }
}

async function runner(sub, { cwd, env, deps, log }) {
  const run = deps.gh ?? gh;
  if (sub === 'status') {
    const { repo } = access({ cwd, env, deps, reads: true });
    const r = findRunner(repo, run);
    if (!r) {
      log(`${RUNNER_NAME}: not installed`);
      return 1;
    }
    log(`${RUNNER_NAME}: ${r.status}${r.busy ? ', busy' : ''} (${r.labels.join(', ')})`);
    return r.status === 'online' ? 0 : 1;
  }
  if (sub === 'install') {
    const { repo } = access({ cwd, env, deps });
    const { host, key, pin, appsDataset } = nasEnv(env);
    if (!appsDataset) throw new Error('Set TRUENAS_APPS_DATASET: the parent dataset for apps on the NAS.');
    const nas = await (deps.connectNas ?? connectNas)({ host, key, pin });
    try {
      log(`Installing the runner ${RUNNER_NAME} for ${repo} on the NAS…`);
      await installRunner({ repo, nas, gh: run, host, pin, appsDataset, log, wait: deps.wait, waitOptions: deps.waitOptions });
      log('Done. Check from any machine with harness infra runner status.');
    } finally {
      nas.close();
    }
    return 0;
  }
  throw new Error(`harness infra runner install | status, not "${sub ?? ''}"`);
}

// The checks before spin-up starts anything (G-0028): the environment has the four secrets,
// and, for a project that syncs, the runner on the NAS is online. Throws with the one-time
// step that is missing. A private project that syncs also needs GHCR_PULL_TOKEN (G-0030);
// without it spin-up still makes what it can and ends with a Remaining line.
export function infraPreflight({ repo, environment, gh: run, sync, isPrivate, log }) {
  try {
    run(['api', `repos/${repo}/environments/${encodeURIComponent(environment)}`]);
  } catch {
    throw new Error(`${repo} has no environment ${environment}: the Engineer creates it, with the secrets ${SECRETS.join(', ')}`);
  }
  const names = new Set(JSON.parse(run(['secret', 'list', '--repo', repo, '--env', environment, '--json', 'name'])).map((s) => s.name));
  const missing = SECRETS.filter((s) => !names.has(s));
  if (missing.length) throw new Error(`the environment ${environment} lacks ${missing.join(', ')}: the Engineer adds ${missing.length === 1 ? 'it' : 'them'} first`);
  log(`✓ the infrastructure: the environment ${environment} has its secrets`);
  if (sync && isPrivate && !names.has('GHCR_PULL_TOKEN'))
    log("! the secret GHCR_PULL_TOKEN isn't there yet: a private project's backend waits for it (G-0030); the rest goes ahead");
  if (sync) {
    const runner = findRunner(repo, run);
    if (runner?.status !== 'online') throw new Error(`the runner ${RUNNER_NAME} on the NAS is ${runner ? runner.status : 'not installed'}: see harness infra runner status`);
    log(`✓ the runner ${RUNNER_NAME}: online`);
  }
}

// The project's Funnel paths from its default branch, or undefined when it doesn't sync.
export function readFunnelPaths(repository, run) {
  let content;
  try {
    content = run(['api', `repos/${repository}/contents/backend/funnel.json`, '--jq', '.content']);
  } catch (e) {
    if (/HTTP 404|Not Found/i.test(e.message)) return undefined;
    throw e;
  }
  let paths;
  try {
    paths = JSON.parse(Buffer.from(String(content).replace(/\s/g, ''), 'base64').toString('utf8'));
  } catch (e) {
    throw new Error(`backend/funnel.json isn't JSON: ${e.message}`);
  }
  return checkFunnelPaths(paths);
}

// Prints each job's result in order and returns { code, site, remaining, failed }.
export function reportRun({ run, results }, log) {
  const name = (job) => String(job.name ?? '').split(' / ').pop();
  const ordered = [...results].sort((a, b) => JOB_ORDER.indexOf(name(a.job)) - JOB_ORDER.indexOf(name(b.job)));
  let site;
  let failed = run.conclusion !== 'success';
  let said = false;
  const remaining = [];
  for (const { job, result } of ordered) {
    if (!result) {
      if (job.conclusion === 'failure') {
        const step = (job.steps ?? []).find((s) => s.conclusion === 'failure')?.name ?? 'a step';
        log(`✗ the ${name(job)} job failed at "${step}": ${run.url}`);
        said = true;
      }
      continue;
    }
    for (const line of String(result.stdout).split('\n').filter(Boolean)) {
      log(line);
      if (line.startsWith('Remaining:')) remaining.push(line);
    }
    if (result.stderr) {
      log(result.stderr);
      said = true;
    }
    if (result.code !== 0) failed = true;
    site ??= result.site;
  }
  if (failed && !said) log(`✗ the run ended ${run.conclusion}: ${run.url}`);
  return { code: failed || remaining.length ? 1 : 0, site, remaining, failed };
}

// Spin-up for a project whose repository exists (G-0028). `repo` is the infrastructure
// repository; `gh` runs gh. Returns { code, site, remaining, failed }.
export async function upProject({ name, repository, repo, environment, gh: run, installation, log, deps = {} }) {
  checkProjectName(name);
  checkRepository(repository);
  const view = viewRepo(repository, run);
  if (!view) throw new Error(`${repository} isn't on GitHub, or this account can't see it`);
  const isPrivate = String(view.visibility).toUpperCase() !== 'PUBLIC';
  const paths = readFunnelPaths(repository, run);
  const sync = Boolean(paths);
  log(`Spinning up ${repository} (${isPrivate ? 'private' : 'public'}, ${sync ? 'with a backend' : 'without a backend'})`);
  infraPreflight({ repo, environment, gh: run, sync, isPrivate, log });
  if (sync) {
    const published = JSON.parse(run(['run', 'list', '--repo', repository, '--workflow', 'backend.yml', '--branch', 'main', '--status', 'success', '--limit', '1', '--json', 'databaseId']));
    if (!published.length) throw new Error(`${repository}'s backend image isn't published yet: its backend workflow hasn't succeeded on main`);
    log('✓ the backend image: published');
  }
  log('Starting project-up.yml; this takes a while…');
  const outcome = await runWorkflow({
    repo,
    workflow: 'project-up.yml',
    inputs: { project: name, repository, sync: String(sync), private: String(isPrivate), 'funnel-paths': JSON.stringify(paths ?? []), 'installation-id': installation ?? '' },
    gh: run,
    wait: deps.wait,
    needsRunner: sync,
    every: 10000,
    finishTries: 360,
    ...(deps.remoteOptions ?? {}),
  });
  const r = reportRun(outcome, log);
  if (r.site) log(`The site: ${r.site}`);
  if (!r.failed && !r.remaining.length && sync)
    log("Remaining: the backend has no superuser and no user yet. The Engineer makes the superuser in the PocketBase container's shell on the NAS, and the first user in the admin screen, from a device on the tailnet.");
  return r;
}

// What `harness create` uses: the access check now, and preflight and spin-up for later.
export function infraFor({ cwd, env = process.env, getLogin, gh: run = gh }) {
  const { repo, environment } = access({ cwd, env, deps: { getLogin, gh: run } });
  return {
    preflight: ({ sync, isPrivate, log }) => infraPreflight({ repo, environment, gh: run, sync, isPrivate, log }),
    up: ({ name, repository, log, wait }) =>
      upProject({ name, repository, repo, environment, gh: run, installation: readSettings(env).netlifyInstallation, log, deps: { wait } }),
  };
}

async function up(o, { cwd, env, deps, log }) {
  const name = checkProjectName(o.positional[1]);
  const run = deps.gh ?? gh;
  const { login, repo, environment } = access({ cwd, env, deps });
  const repository = checkRepository(o.repo ?? `${login}/${name}`);
  const installation = o.netlifyInstallation ?? readSettings(env).netlifyInstallation;
  if (installation !== undefined && !/^\d+$/.test(String(installation))) throw new Error(`"${installation}" isn't the number of an installation`);
  const r = await upProject({ name, repository, repo, environment, gh: run, installation, log, deps });
  log(r.failed ? 'Not finished: fix what failed, then run harness infra up again; it goes on where it stopped.' : r.remaining.length ? 'Not finished: see the Remaining lines.' : 'Done.');
  return r.failed ? 1 : 0;
}

// What teardown removes, in the words the Engineer reads before saying yes.
export const downList = (name, repository) => [
  `harness infra down ${name} would delete, for good:`,
  `  - the Netlify site that builds from ${repository} and carries spin-up's mark`,
  `  - on the NAS: the app ${name}, its snapshot task, and its dataset under the parent dataset for apps, marked harness:project=${name}, with every snapshot of it`,
  'Nothing else, and only what spin-up made for this project. There is no undo.',
  'Ask the Engineer in chat; with their yes, run it again with --confirmed.',
];

async function down(o, { cwd, env, deps, log }) {
  const name = checkProjectName(o.positional[1]);
  // Anyone else is refused before anything is listed or started.
  const { login, repo } = access({ cwd, env, deps });
  const repository = checkRepository(o.repo ?? `${login}/${name}`);
  if (!o.confirmed) {
    for (const line of downList(name, repository)) log(line);
    return 2;
  }
  log(`Starting project-down.yml for ${repository}…`);
  const outcome = await runWorkflow({ repo, workflow: 'project-down.yml', inputs: { project: name, repository, confirmation: name }, gh: deps.gh ?? gh, wait: deps.wait, ...(deps.remoteOptions ?? {}) });
  const r = reportRun(outcome, log);
  if (r.failed) {
    log('Not finished: what is listed above as deleted is gone; fix what failed, then run harness infra down again.');
    return 1;
  }
  log(`Remaining: what only the Engineer can remove: the machine ${name} in the tailnet's admin console, the repository ${repository}, and its container image ${repository.toLowerCase()}-backend.`);
  log('Done.');
  return 0;
}

// Inside a workflow on the runner. The inputs come as environment variables, never on the
// command line; the result goes to the log as marker lines, for the command that started it.
export async function job(kind, env = process.env, print = console.log) {
  let result;
  if (SPIN_JOBS.includes(kind)) {
    result = await spinJob(kind, env);
  } else if (kind === 'nas') {
    const args = [env.NAS_METHOD ?? '', env.NAS_PARAMS || '[]', ...(env.NAS_JOB === 'true' ? ['--job'] : []), ...(env.NAS_CONFIRMED === 'true' ? ['--confirmed'] : [])];
    try {
      result = await runLocal(parseNasArgs(args), env);
    } catch (e) {
      result = { code: 1, stdout: '', stderr: e.message };
    }
  } else if (kind === 'check') {
    const lines = [];
    let ok = true;
    for (const s of SECRETS) {
      const there = env[`HAS_${s}`] === 'true';
      ok &&= there;
      lines.push(there ? `✓ the secret ${s}` : `✗ the secret ${s} is missing from the environment`);
    }
    for (const [s, why] of Object.entries(LATER_SECRETS))
      lines.push(env[`HAS_${s}`] === 'true' ? `✓ the secret ${s}` : `· the secret ${s} isn't there yet: needed ${why}`);
    const settings = ['TRUENAS_HOST', 'TRUENAS_CERT_SHA256', 'TRUENAS_APPS_DATASET'];
    const missing = settings.filter((s) => !env[s]);
    if (missing.length) {
      ok = false;
      lines.push(`✗ the runner's configuration lacks ${missing.join(', ')}: run harness infra runner install`);
    } else lines.push(`✓ the runner's configuration: ${settings.join(', ')}`);
    const ping = await runLocal({ method: 'core.ping', params: [] }, env);
    if (ping.code === 0 && JSON.parse(ping.stdout) === 'pong') lines.push('✓ the NAS answers: core.ping gave "pong"');
    else {
      ok = false;
      lines.push(`✗ the NAS didn't answer core.ping: ${ping.stderr}`);
    }
    result = ok ? { code: 0, stdout: lines.join('\n'), stderr: '' } : { code: 1, stdout: lines.join('\n'), stderr: '✗ the check found something missing' };
  } else throw new Error(`harness infra job nas | check | ${SPIN_JOBS.join(' | ')}, not "${kind ?? ''}"`);
  print(`harness ${kind}: exit ${result.code}`);
  for (const line of resultLines(result)) print(line);
  return result.code;
}

export async function main(args, cwd = process.cwd(), deps = {}) {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(USAGE);
    return args.length === 0 ? 1 : 0;
  }
  try {
    const o = parseInfraArgs(args);
    const [command, sub] = o.positional;
    if (command === 'init') return await init(o, { cwd, env, deps, log });
    if (command === 'check') return await check({ cwd, env, deps, log });
    if (command === 'runner') return await runner(sub, { cwd, env, deps, log });
    if (command === 'up') return await up(o, { cwd, env, deps, log });
    if (command === 'down') return await down(o, { cwd, env, deps, log });
    if (command === 'job') return await job(sub, env, log);
    throw new Error(`unknown command "${command}"\n\n${USAGE}`);
  } catch (e) {
    const detail = e instanceof NasError && e.detail ? `\n${JSON.stringify(e.detail)}` : '';
    console.error(`✗ ${e.message}${detail}`);
    return 1;
  }
}
