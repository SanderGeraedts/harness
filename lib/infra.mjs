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
import { RUNNER_NAME, findRunner, installRunner } from './infra/runner.mjs';
import { infraSettings, writeSettings } from './infra/settings.mjs';

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

const VALUE_FLAGS = ['repo', 'environment', 'dir', 'harness-ref'];

export function parseInfraArgs(args) {
  const o = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      o.positional.push(a);
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
function access({ cwd, env, deps, given = {}, mayCreate = false }) {
  const login = requireListedEngineer({ cwd, getLogin: deps.getLogin ?? ghLogin });
  const { repo, environment } = infraSettings(given, env);
  const run = deps.gh ?? gh;
  if (mayCreate && !viewRepo(repo, run)) {
    if (repo.split('/')[0].toLowerCase() !== login.toLowerCase())
      throw new Error(`only the Engineer may change the infrastructure (G-0026): ${login} can't see ${repo}, and it can only be created under ${login}`);
    return { login, repo, environment, found: undefined };
  }
  return { login, repo, environment, found: requireAdmin({ repo, login, gh: run }) };
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
  const work = mkdtempSync(join(tmpdir(), 'harness-infra-'));
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
        const branch = `harness-infra-${ref.replace(/[^\w.-]/g, '-')}-${Date.now().toString(36)}`;
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
  const { repo } = access({ cwd, env, deps });
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
    const { repo } = access({ cwd, env, deps });
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

// Inside a workflow on the runner. The inputs come as environment variables, never on the
// command line; the result goes to the log as marker lines, for the command that started it.
export async function job(kind, env = process.env, print = console.log) {
  let result;
  if (kind === 'nas') {
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
  } else throw new Error(`harness infra job nas | check, not "${kind ?? ''}"`);
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
    if (command === 'job') return await job(sub, env, log);
    throw new Error(`unknown command "${command}"\n\n${USAGE}`);
  } catch (e) {
    const detail = e instanceof NasError && e.detail ? `\n${JSON.stringify(e.detail)}` : '';
    console.error(`✗ ${e.message}${detail}`);
    return 1;
  }
}
