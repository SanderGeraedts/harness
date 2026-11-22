// harness backend: a throwaway backend without Docker (G-0032).
//
//   harness backend [start]   start one on an empty database and print its address
//   harness backend status    say whether one runs for this project, and where
//   harness backend smoke     run backend/smoke-test.sh against it, with jq on the PATH
//   harness backend stop      stop it and remove its database
//
// It reads the versions backend/Dockerfile pins: the PocketBase image's tag, or, when
// backend/main.go makes the backend a Go program, the golang image's tag. It downloads those
// exact releases once into a per-user cache, checks their published checksums, builds the Go
// program when there is one, and starts it with the flags backend/throwaway.sh gives the
// container. jq comes the same way, at a pinned version and checksum. Nothing is installed
// system-wide, and nothing it downloads or builds is put in the repository.
//
// Settings, as throwaway.sh takes them: BACKEND_TEST_PORT (a free port when unset),
// APP_ORIGIN (https://app.example), BACKEND_TEST_SUPERUSER_EMAIL and _PASSWORD.
// HARNESS_CACHE_DIR moves the cache.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { extract } from './archive.mjs';

export const DOCKERFILE = 'backend/Dockerfile';
const EMAIL = 'admin@throwaway.invalid';
const PASSWORD = 'throwaway-only-password';
const ORIGIN = 'https://app.example';

// jq for the smoke test: the release and the SHA-256 sums it publishes (sha256sum.txt).
export const JQ = {
  version: '1.8.2',
  sha256: {
    'linux-amd64': 'b1c22172dd303f3be49e935aa56aa48a8b7a46e0bc838b4997d3bb451495870f',
    'linux-arm64': '8b85c817833814ddca00a144c33705546355afccf0cf39b188f3cdb48b852309',
    'macos-amd64': 'e94b266e3c26690550006abe63152b782280f4e14374accdf04cbde844f00bc0',
    'macos-arm64': '2d75340ba57a4b4b4c8708a21c2dc8e958a48aaa8bba13b27f77f6e4c0eca07e',
    'windows-amd64': 'a6fc67fedaf9128a3309a1e2ebb8b986aeccf70122ee46d2cb4849e423f0c627',
    'windows-arm64': '083b5377392bc57cf27052b6d20a2d927770683bca844632901ff38b4b7b0ac7',
  },
};

// The per-user cache: %LOCALAPPDATA%\harness, ~/Library/Caches/harness, or
// $XDG_CACHE_HOME/harness (~/.cache/harness).
export function cacheDir(env = process.env, platform = process.platform, home = homedir()) {
  if (env.HARNESS_CACHE_DIR) return resolve(env.HARNESS_CACHE_DIR);
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'harness');
  if (env.XDG_CACHE_HOME) return join(env.XDG_CACHE_HOME, 'harness');
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'harness');
  return join(home, '.cache', 'harness');
}

// The release names of this machine.
export function target(platform = process.platform, arch = process.arch) {
  const os = { linux: 'linux', darwin: 'darwin', win32: 'windows' }[platform];
  const cpu = { x64: 'amd64', arm64: 'arm64' }[arch];
  if (!os || !cpu) throw new Error(`harness backend runs on Linux, macOS and Windows, on x64 or arm64; not on ${platform} ${arch}`);
  return { os, arch: cpu, exe: os === 'windows' ? '.exe' : '' };
}

// The versions backend/Dockerfile pins: { pocketbase, go, goProgram }. ARG defaults are
// filled in, so `FROM golang:${GO_VERSION}` works as Docker reads it.
export function readPins(projectDir) {
  const path = join(projectDir, DOCKERFILE);
  if (!existsSync(path)) throw new Error(`no ${DOCKERFILE}: this project has no backend`);
  const lines = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\\\n/g, ' ').split('\n');
  const args = {};
  const images = [];
  for (const line of lines) {
    const arg = line.match(/^\s*ARG\s+([A-Za-z_]\w*)=("?)([^"\s]*)\2\s*$/i);
    if (arg) args[arg[1]] = arg[3];
    const from = line.match(/^\s*FROM\s+(?:--\S+\s+)*(\S+)/i);
    if (from)
      images.push(from[1].replace(/\$\{(\w+)(?::?-([^}]*))?\}|\$(\w+)/g, (_, a, def, b) => args[a ?? b] ?? def ?? ''));
  }
  const tagOf = (name) => {
    for (const image of images) {
      const m = image.match(/^(?:.*\/)?([^/:@]+)(?::([^@]+))?(?:@.*)?$/);
      if (m && (name === 'golang' ? m[1] === 'golang' : m[1].includes(name))) return { image, tag: m[2] ?? '' };
    }
    return undefined;
  };
  const goProgram = existsSync(join(projectDir, 'backend', 'main.go'));
  const pins = { goProgram };
  if (goProgram) {
    const go = tagOf('golang');
    if (!go) throw new Error(`backend/main.go makes the backend a Go program, but ${DOCKERFILE} has no golang image (FROM golang:<version>) to take the Go version from`);
    const v = go.tag.match(/^(\d+\.\d+(?:\.\d+)?)(?:$|-)/)?.[1];
    if (!v) throw new Error(`${DOCKERFILE}: ${go.image} pins no Go version; pin one, like golang:1.24.2`);
    pins.go = v;
  } else {
    const pb = tagOf('pocketbase');
    if (!pb) throw new Error(`${DOCKERFILE} has no PocketBase image (FROM <registry>/pocketbase:<version>) to take the version from`);
    const v = pb.tag.match(/^v?(\d+\.\d+\.\d+)$/)?.[1];
    if (!v) throw new Error(`${DOCKERFILE}: ${pb.image} pins no PocketBase version; pin one, like pocketbase:0.40.6`);
    pins.pocketbase = v;
  }
  return pins;
}

export async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'harness-backend' } });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
function verify(buf, expected, what) {
  if (!/^[0-9a-f]{64}$/.test(expected ?? '')) throw new Error(`no published SHA-256 checksum for ${what}`);
  const got = sha256(buf);
  if (got !== expected) throw new Error(`${what}: the checksum doesn't match (expected ${expected}, got ${got}); nothing was installed`);
}

// "<sha256>  <file>" lines.
export function parseSums(text) {
  const sums = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(\S+)\s*$/);
    if (m) sums[m[2]] = m[1];
  }
  return sums;
}

// Fills `dir` once: into a scratch folder first, renamed when complete.
async function once(dir, fill) {
  if (existsSync(join(dir, '.complete'))) return dir;
  const scratch = `${dir}.partial-${process.pid}`;
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  try {
    await fill(scratch);
    writeFileSync(join(scratch, '.complete'), `${new Date().toISOString()}\n`);
    rmSync(dir, { recursive: true, force: true });
    renameSync(scratch, dir);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return dir;
}

function executable(path) {
  try {
    chmodSync(path, 0o755);
  } catch {
    // Windows has no modes.
  }
  return path;
}

export async function ensurePocketBase(version, t, { cache, download, log }) {
  const asset = `pocketbase_${version}_${t.os}_${t.arch}.zip`;
  const dir = join(cache, 'tools', `pocketbase-${version}-${t.os}-${t.arch}`);
  await once(dir, async (into) => {
    const base = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/`;
    log(`Downloading PocketBase ${version} for ${t.os}/${t.arch} into ${dirname(dir)}`);
    const sums = parseSums((await download(`${base}checksums.txt`)).toString('utf8'));
    const buf = await download(base + asset);
    verify(buf, sums[asset], asset);
    extract(asset, buf, into);
  });
  return executable(join(dir, `pocketbase${t.exe}`));
}

const goTriple = (v) => v.replace(/^go/, '').split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [goTriple(a), goTriple(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

// The Go toolchain: the exact version, or the newest x.y.z of an x.y pin, from go.dev.
export async function ensureGo(version, t, { cache, download, log }) {
  const tools = join(cache, 'tools');
  const done = (v) => join(tools, `go-${v}-${t.os}-${t.arch}`);
  const exact = /^\d+\.\d+\.\d+$/.test(version);
  if (exact && existsSync(join(done(version), '.complete'))) return join(done(version), 'go', 'bin', `go${t.exe}`);
  if (!exact && existsSync(tools)) {
    const have = readdirSync(tools)
      .map((d) => d.match(new RegExp(`^go-(${version.replace('.', '\\.')}\\.\\d+)-${t.os}-${t.arch}$`))?.[1])
      .filter((v) => v && existsSync(join(done(v), '.complete')))
      .sort((a, b) => (newer(a, b) ? -1 : 1));
    if (have.length) return join(done(have[0]), 'go', 'bin', `go${t.exe}`);
  }
  const releases = JSON.parse((await download('https://go.dev/dl/?mode=json&include=all')).toString('utf8'));
  const release = exact
    ? releases.find((r) => r.version === `go${version}`)
    : releases.filter((r) => r.stable && r.version.startsWith(`go${version}.`)).sort((a, b) => (newer(a.version, b.version) ? -1 : 1))[0];
  if (!release) throw new Error(`go.dev lists no Go ${version}`);
  const file = release.files.find((f) => f.os === t.os && f.arch === t.arch && f.kind === 'archive');
  if (!file) throw new Error(`go.dev has no ${release.version} archive for ${t.os}/${t.arch}`);
  const v = release.version.replace(/^go/, '');
  const dir = done(v);
  await once(dir, async (into) => {
    log(`Downloading Go ${v} for ${t.os}/${t.arch} into ${tools}`);
    const buf = await download(`https://go.dev/dl/${file.filename}`);
    verify(buf, file.sha256, file.filename);
    extract(file.filename, buf, into);
  });
  return executable(join(dir, 'go', 'bin', `go${t.exe}`));
}

// jq, and the folder to put first on the PATH for it. On Windows that folder holds a shell
// script that runs jq.exe with --binary, so its output has no carriage returns.
export async function ensureJq(t, { cache, download, log, jq = JQ }) {
  const name = `jq-${t.os === 'darwin' ? 'macos' : t.os}-${t.arch}`;
  const dir = join(cache, 'tools', `jq-${jq.version}-${t.os}-${t.arch}`);
  await once(dir, async (into) => {
    log(`Downloading jq ${jq.version} for ${t.os}/${t.arch} into ${dirname(dir)}`);
    const buf = await download(`https://github.com/jqlang/jq/releases/download/jq-${jq.version}/${name}${t.exe}`);
    verify(buf, jq.sha256[name.replace(/^jq-/, '')], name + t.exe);
    writeFileSync(join(into, `jq${t.exe}`), buf);
    executable(join(into, `jq${t.exe}`));
    if (t.exe) {
      mkdirSync(join(into, 'shim'));
      writeFileSync(join(into, 'shim', 'jq'), `#!/usr/bin/env bash\nexec "${join(dir, 'jq.exe').replace(/\\/g, '/')}" --binary "$@"\n`);
    }
  });
  return { jq: join(dir, `jq${t.exe}`), bin: t.exe ? join(dir, 'shim') : dir };
}

// The folder that holds what one project's backend runs from: outside the repository.
export const stateDir = (cache, projectDir) => join(cache, 'backends', createHash('sha256').update(resolve(projectDir).toLowerCase()).digest('hex').slice(0, 16));

export function readState(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

export function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

// The process the state names still runs and still holds its port: so it is ours, not a
// later process that was given the same number.
export async function running(state) {
  return Boolean(state) && alive(state.pid) && !(await portIsFree(state.port));
}

export function freePort() {
  return new Promise((ok, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => ok(port));
    });
  });
}

function portIsFree(port) {
  return new Promise((ok) => {
    const server = createServer();
    server.once('error', () => ok(false));
    server.listen(port, '127.0.0.1', () => server.close(() => ok(true)));
  });
}

async function healthy(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The flags throwaway.sh gives the container, for the folders that exist and the flags this
// build of the backend knows (a Go program may leave out the JavaScript hooks).
export function backendFlags(projectDir, dataDir, help) {
  const knows = (flag) => help.includes(`--${flag}`);
  const flags = [`--dir=${dataDir}`];
  const migrations = join(projectDir, 'backend', 'pb_migrations');
  const hooks = join(projectDir, 'backend', 'pb_hooks');
  if (existsSync(migrations) && knows('migrationsDir')) flags.push(`--migrationsDir=${migrations}`);
  if (existsSync(hooks) && knows('hooksDir')) flags.push(`--hooksDir=${hooks}`);
  // The container's hooks are a copy that never changes; these are the working files.
  if (existsSync(hooks) && knows('hooksWatch')) flags.push('--hooksWatch=false');
  if (knows('automigrate')) flags.push('--automigrate=false');
  return flags;
}

// The defaults every command takes; tests replace them.
export function defaults(over = {}) {
  const env = over.env ?? process.env;
  return {
    env,
    cache: cacheDir(env),
    target: target(),
    download: fetchBuffer,
    launch: (bin, args) => [bin, args],
    log: (m) => console.log(m),
    error: (m) => console.error(m),
    timeoutMs: 30_000,
    ...over,
  };
}

function bashCommand(env) {
  if (env.HARNESS_BASH) return env.HARNESS_BASH;
  if (process.platform !== 'win32') return 'bash';
  // Git's bash, not the one that starts WSL.
  const where = spawnSync('where', ['git'], { encoding: 'utf8' });
  for (const git of (where.stdout ?? '').split(/\r?\n/).filter(Boolean)) {
    const bash = join(dirname(git), '..', 'bin', 'bash.exe');
    if (existsSync(bash)) return bash;
  }
  return 'bash';
}

function withPath(env, dir) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  return { ...env, [key]: `${dir}${delimiter}${env[key] ?? ''}` };
}

export async function stop(projectDir, d = defaults(), { quiet = false } = {}) {
  const dir = stateDir(d.cache, projectDir);
  const state = readState(dir);
  if (await running(state)) {
    try {
      process.kill(state.pid, 'SIGTERM');
    } catch {
      // Gone in the meantime.
    }
    for (let i = 0; i < 40 && alive(state.pid); i++) await sleep(250);
    if (alive(state.pid)) process.kill(state.pid, 'SIGKILL');
    for (let i = 0; i < 20 && alive(state.pid); i++) await sleep(250);
  }
  rmSync(join(dir, 'state.json'), { force: true });
  rmSync(join(dir, 'pb_data'), { recursive: true, force: true, maxRetries: 10 });
  if (!quiet) d.log(state ? 'The throwaway backend is stopped, and its database removed.' : 'No throwaway backend runs for this project.');
  return 0;
}

export async function start(projectDir, d = defaults()) {
  const pins = readPins(projectDir);
  const dir = stateDir(d.cache, projectDir);
  await stop(projectDir, d, { quiet: true });
  mkdirSync(dir, { recursive: true });
  const t = d.target;
  let binary;
  if (pins.goProgram) {
    const go = await ensureGo(pins.go, t, d);
    binary = join(dir, `backend${t.exe}`);
    d.log(`Building backend/main.go with Go ${go.match(/go-(\d+\.\d+\.\d+)-/)?.[1] ?? pins.go}`);
    const [cmd, args] = d.launch(go, ['build', '-o', binary, '.']);
    const built = spawnSync(cmd, args, {
      cwd: join(projectDir, 'backend'),
      stdio: 'inherit',
      env: { ...d.env, GOTOOLCHAIN: 'local', CGO_ENABLED: '0', GOPATH: join(d.cache, 'go'), GOCACHE: join(d.cache, 'go-build'), GOFLAGS: '-modcacherw' },
    });
    if (built.status !== 0) throw new Error('go build failed; see above');
  } else binary = await ensurePocketBase(pins.pocketbase, t, d);
  const jq = await ensureJq(t, d);

  const port = d.env.BACKEND_TEST_PORT ? Number(d.env.BACKEND_TEST_PORT) : await freePort();
  if (!(await portIsFree(port))) throw new Error(`port ${port} is taken: stop what uses it, or set BACKEND_TEST_PORT to another`);
  const origin = d.env.APP_ORIGIN || ORIGIN;
  const url = `http://127.0.0.1:${port}`;
  const dataDir = join(dir, 'pb_data');
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 10 });
  mkdirSync(dataDir);

  const run = (args, opts) => {
    const [cmd, all] = d.launch(binary, args);
    return [cmd, all, { cwd: dir, env: d.env, windowsHide: true, ...opts }];
  };
  const help = spawnSync(...run(['serve', '--help'], { encoding: 'utf8' }));
  const flags = backendFlags(projectDir, dataDir, `${help.stdout ?? ''}${help.stderr ?? ''}`);
  const logFile = join(dir, 'backend.log');
  const out = openSync(logFile, 'w');
  const child = spawn(...run(['serve', `--http=127.0.0.1:${port}`, ...flags, `--origins=${origin}`], { detached: true, stdio: ['ignore', out, out] }));
  closeSync(out);
  let exited = false;
  child.on('exit', () => (exited = true));
  child.on('error', () => (exited = true));
  child.unref();
  const state = { pid: child.pid, port, url, origin, binary, dataDir, log: logFile, jq: jq.jq, path: jq.bin, project: resolve(projectDir), versions: pins, startedAt: new Date().toISOString() };
  writeFileSync(join(dir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);

  // A migration that throws makes PocketBase exit: stop waiting as soon as it has.
  const showLog = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');
  for (const until = Date.now() + d.timeoutMs; ; ) {
    if (await healthy(url)) break;
    if (exited) {
      await stop(projectDir, d, { quiet: true });
      throw new Error(`The backend stopped while starting:\n${showLog()}`);
    }
    if (Date.now() > until) {
      await stop(projectDir, d, { quiet: true });
      throw new Error(`The backend was not healthy after ${d.timeoutMs / 1000} seconds:\n${showLog()}`);
    }
    await sleep(250);
  }
  const email = d.env.BACKEND_TEST_SUPERUSER_EMAIL || EMAIL;
  const upsert = spawnSync(...run(['superuser', 'upsert', email, d.env.BACKEND_TEST_SUPERUSER_PASSWORD || PASSWORD, ...flags], { encoding: 'utf8' }));
  if (upsert.status !== 0) {
    await stop(projectDir, d, { quiet: true });
    throw new Error(`Could not make the superuser:\n${upsert.stdout}${upsert.stderr}`);
  }
  d.log(`The throwaway backend is at ${url}, for ${origin}`);
  d.log(`  BACKEND_TEST_URL=${url}`);
  d.log(`  jq: ${jq.jq}`);
  d.log('  harness backend smoke runs the smoke test against it; harness backend stop stops it.');
  return 0;
}

export async function status(projectDir, d = defaults()) {
  const state = readState(stateDir(d.cache, projectDir));
  if (await running(state)) {
    d.log(`The throwaway backend is at ${state.url}, for ${state.origin} (process ${state.pid})`);
    return 0;
  }
  d.log('No throwaway backend runs for this project: harness backend start starts one.');
  return 1;
}

export async function smoke(projectDir, d = defaults()) {
  const state = readState(stateDir(d.cache, projectDir));
  if (!(await running(state))) {
    d.error('✗ No throwaway backend runs for this project: run harness backend start first.');
    return 1;
  }
  const env = withPath({ ...d.env, BACKEND_TEST_URL: state.url, APP_ORIGIN: state.origin }, state.path);
  const r = spawnSync(bashCommand(d.env), ['backend/smoke-test.sh'], { cwd: projectDir, stdio: 'inherit', env });
  return r.status ?? 1;
}

const USAGE = `harness backend [start|status|smoke|stop]

  start    start a throwaway backend on an empty database, from the versions
           backend/Dockerfile pins, without Docker, and print its address (the default)
  status   say whether one runs for this project, and where
  smoke    run backend/smoke-test.sh against it, with jq on the PATH
  stop     stop it and remove its database
`;

export async function main(args, cwd = process.cwd(), over = {}) {
  const [command = 'start', ...rest] = args;
  if (command === '--help' || command === '-h' || rest.length) {
    process.stdout.write(USAGE);
    return command.startsWith('-') ? 0 : 1;
  }
  if (!existsSync(join(cwd, 'package.json'))) {
    console.error('✗ no package.json here: run harness backend in the project root');
    return 1;
  }
  let d;
  try {
    d = defaults(over);
    if (command === 'start') return await start(cwd, d);
    if (command === 'stop') return await stop(cwd, d);
    if (command === 'status') return await status(cwd, d);
    if (command === 'smoke') return await smoke(cwd, d);
  } catch (e) {
    (d?.error ?? console.error)(`✗ ${e.message}`);
    return 1;
  }
  console.error(`✗ unknown backend command "${command}"\n\n${USAGE}`);
  return 1;
}
