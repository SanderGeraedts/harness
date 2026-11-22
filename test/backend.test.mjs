// harness backend (G-0032) without the network: the downloads come from fixtures made here,
// and the "PocketBase" and "Go" they hold are small Node scripts, run through Node.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { deflateRawSync, gunzipSync, gzipSync } from 'node:zlib';
import { extractTarGz, extractZip, safePath, tarEntries, zipEntries } from '../lib/archive.mjs';
import { backendFlags, cacheDir, defaults, main, readPins, readState, stateDir, target } from '../lib/backend.mjs';
import { cleanUp, tempDir, write } from './helpers.mjs';

after(cleanUp);

// A zip archive of { name: content } (deflated), with Unix modes.
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const packed = deflateRawSync(data);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(((0o100755 << 16) >>> 0), 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, packed);
    centrals.push(central, n);
    offset += 30 + n.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

// A gzipped tar archive of { name: content }; a name over 100 characters gets a PAX header.
function makeTarGz(files) {
  const blocks = [];
  const header = (name, size, type, mode = 0o755) => {
    const h = Buffer.alloc(512);
    h.write(name.slice(0, 99), 0);
    h.write(`${mode.toString(8).padStart(7, '0')}\0`, 100);
    h.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
    h.write(type, 156);
    h.write('ustar\0', 257);
    h.write('00', 263);
    return h;
  };
  const body = (data) => Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    if (name.length > 99) {
      const record = ` path=${name}\n`;
      const pax = Buffer.from(`${record.length + String(record.length + 3).length}${record}`);
      blocks.push(header('PaxHeader', pax.length, 'x', 0o644), body(pax));
    }
    blocks.push(header(name, data.length, name.endsWith('/') ? '5' : '0'), body(data));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// What the fake PocketBase does: answers serve --help, serves /api/health, and records the
// superuser it was asked to make.
const FAKE_POCKETBASE = `
const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http');
const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith('--' + n + '='))?.split('=').slice(1).join('=');
if (args.includes('--help')) { console.log('Flags: --http --origins\\nGlobal Flags: --dir --migrationsDir --hooksDir --hooksWatch --automigrate'); process.exit(0); }
if (process.env.FAKE_EXIT) { console.error('a migration failed'); process.exit(1); }
const dir = flag('dir');
if (args[0] === 'superuser') { fs.writeFileSync(path.join(dir, 'superuser.json'), JSON.stringify(args)); process.exit(0); }
fs.writeFileSync(path.join(dir, 'serve.json'), JSON.stringify(args));
const [host, port] = flag('http').split(':');
http.createServer((q, s) => { s.statusCode = q.url === '/api/health' ? 200 : 404; s.end('{}'); }).listen(Number(port), host);
`;

// The fake go: "go build -o <out> ." writes the fake PocketBase to <out>, and what it was given.
const FAKE_GO = `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(args[args.indexOf('-o') + 1], ${JSON.stringify(FAKE_POCKETBASE)});
fs.writeFileSync('go-build.json', JSON.stringify({ args, cwd: process.cwd(), GOTOOLCHAIN: process.env.GOTOOLCHAIN, CGO_ENABLED: process.env.CGO_ENABLED, GOPATH: process.env.GOPATH }));
`;

const T = { os: 'linux', arch: 'amd64', exe: '' };
const JQ_FIXTURE = Buffer.from('#!/bin/sh\necho jq\n');

// The downloads, by address; anything else fails the test, so nothing reaches the network.
function fixtures({ pocketbase = '0.40.6', go = '1.24.2', badSum = false } = {}) {
  const pbZip = makeZip({ pocketbase: FAKE_POCKETBASE, 'LICENSE.md': 'MIT' });
  const goTar = makeTarGz({ 'go/': '', 'go/bin/go': FAKE_GO, [`go/${'long/'.repeat(25)}file.txt`]: 'deep' });
  const pbAsset = `pocketbase_${pocketbase}_linux_amd64.zip`;
  const files = {
    [`https://github.com/pocketbase/pocketbase/releases/download/v${pocketbase}/checksums.txt`]: Buffer.from(
      `${'0'.repeat(64)}  pocketbase_${pocketbase}_darwin_arm64.zip\n${badSum ? 'f'.repeat(64) : sha(pbZip)}  ${pbAsset}\n`,
    ),
    [`https://github.com/pocketbase/pocketbase/releases/download/v${pocketbase}/${pbAsset}`]: pbZip,
    'https://go.dev/dl/?mode=json&include=all': Buffer.from(
      JSON.stringify([
        { version: 'go1.25.0', stable: true, files: [{ filename: 'go1.25.0.linux-amd64.tar.gz', os: 'linux', arch: 'amd64', kind: 'archive', sha256: 'x' }] },
        { version: `go${go}`, stable: true, files: [{ filename: `go${go}.linux-amd64.tar.gz`, os: 'linux', arch: 'amd64', kind: 'archive', sha256: sha(goTar) }, { filename: `go${go}.src.tar.gz`, os: '', arch: '', kind: 'source', sha256: 'y' }] },
        { version: 'go1.24.1', stable: true, files: [] },
      ]),
    ),
    [`https://go.dev/dl/go${go}.linux-amd64.tar.gz`]: goTar,
    'https://github.com/jqlang/jq/releases/download/jq-1.8.2/jq-linux-amd64': JQ_FIXTURE,
  };
  const asked = [];
  const download = async (url) => {
    asked.push(url);
    if (!files[url]) throw new Error(`the test asked for ${url}`);
    return files[url];
  };
  return { download, asked };
}

function project({ dockerfile = 'FROM ghcr.io/muchobien/pocketbase:0.40.6\nCOPY pb_migrations /pb_migrations\n', goMain = false } = {}) {
  const dir = tempDir();
  write(dir, 'package.json', '{"name":"p"}\n');
  write(dir, 'backend/Dockerfile', dockerfile);
  write(dir, 'backend/pb_migrations/1_init.js', '');
  write(dir, 'backend/pb_hooks/a.pb.js', '');
  if (goMain) write(dir, 'backend/main.go', 'package main\n');
  return dir;
}

function deps(over = {}) {
  const lines = [];
  const net = fixtures(over.fixtures);
  const d = defaults({
    env: { ...over.env },
    cache: tempDir('harness-cache-'),
    target: T,
    download: net.download,
    launch: (bin, args) => [process.execPath, [bin, ...args]],
    log: (m) => lines.push(m),
    error: (m) => lines.push(m),
    timeoutMs: 10_000,
    jq: { version: '1.8.2', sha256: { 'linux-amd64': sha(JQ_FIXTURE) } },
    ...over.d,
  });
  return { d, lines, net };
}

describe('archives', () => {
  it('unpacks zip and tar.gz, with PAX long names and modes', () => {
    const dir = tempDir();
    extractZip(makeZip({ 'a/b.txt': 'zip' }), dir);
    assert.equal(readFileSync(join(dir, 'a/b.txt'), 'utf8'), 'zip');
    const long = `go/${'long/'.repeat(25)}file.txt`;
    assert.deepEqual(tarEntries(gunzipSync(makeTarGz({ [long]: 'deep' }))).map((e) => e.name), [long]);
    extractTarGz(makeTarGz({ 'go/': '', 'go/bin/go': 'x' }), dir);
    assert.equal(readFileSync(join(dir, 'go/bin/go'), 'utf8'), 'x');
    assert.equal(zipEntries(makeZip({ x: 'y' }))[0].mode, 0o755);
  });

  it('refuses an entry that would land outside its folder', () => {
    const dir = tempDir();
    for (const name of ['../evil', 'a/../../evil', '/etc/evil', 'C:/evil', '..\\evil']) assert.throws(() => safePath(dir, name), /outside its folder/, name);
    assert.throws(() => extractZip(makeZip({ '../evil': 'x' }), dir), /outside its folder/);
    assert.throws(() => zipEntries(Buffer.from('not a zip')), /not a zip archive/);
  });
});

describe('harness backend: where and what', () => {
  it('keeps its cache per user: LOCALAPPDATA, XDG_CACHE_HOME, Library/Caches or ~/.cache', () => {
    assert.equal(cacheDir({ LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, 'win32', 'C:\\Users\\u'), join('C:\\Users\\u\\AppData\\Local', 'harness'));
    assert.equal(cacheDir({ XDG_CACHE_HOME: '/x/cache' }, 'linux', '/home/u'), join('/x/cache', 'harness'));
    assert.equal(cacheDir({}, 'linux', '/home/u'), join('/home/u', '.cache', 'harness'));
    assert.equal(cacheDir({}, 'darwin', '/Users/u'), join('/Users/u', 'Library', 'Caches', 'harness'));
    assert.match(cacheDir({ HARNESS_CACHE_DIR: 'somewhere' }, 'linux', '/home/u'), /somewhere$/);
  });

  it('knows Linux, macOS and Windows on x64 and arm64, and nothing else', () => {
    assert.deepEqual(target('win32', 'x64'), { os: 'windows', arch: 'amd64', exe: '.exe' });
    assert.deepEqual(target('darwin', 'arm64'), { os: 'darwin', arch: 'arm64', exe: '' });
    assert.throws(() => target('freebsd', 'x64'), /not on freebsd x64/);
  });

  it("reads the template's PocketBase pin", () => {
    const pins = readPins(join(import.meta.dirname, '..', 'template-sync'));
    assert.match(pins.pocketbase, /^\d+\.\d+\.\d+$/);
    assert.equal(pins.goProgram, false);
  });

  it('reads a Go pin from a multi-stage Dockerfile, with ARG defaults, suffixes and registries', () => {
    const cases = [
      ['FROM golang:1.24.2-alpine AS build\nFROM alpine:3.22\n', '1.24.2'],
      ['ARG GO_VERSION=1.25\nFROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-bookworm AS build\n', '1.25'],
      ['FROM docker.io/library/golang:1.23.4@sha256:abc AS b\n', '1.23.4'],
    ];
    for (const [dockerfile, go] of cases) assert.equal(readPins(project({ dockerfile, goMain: true })).go, go, dockerfile);
  });

  it('refuses a Dockerfile that pins nothing it can use', () => {
    assert.throws(() => readPins(tempDir()), /no backend\/Dockerfile/);
    assert.throws(() => readPins(project({ dockerfile: 'FROM ghcr.io/muchobien/pocketbase:latest\n' })), /pins no PocketBase version/);
    assert.throws(() => readPins(project({ dockerfile: 'FROM alpine:3.22\n' })), /no PocketBase image/);
    assert.throws(() => readPins(project({ dockerfile: 'FROM ghcr.io/muchobien/pocketbase:0.40.6\n', goMain: true })), /no golang image/);
    assert.throws(() => readPins(project({ dockerfile: 'FROM golang:alpine\n', goMain: true })), /pins no Go version/);
  });

  it('passes the flags throwaway.sh passes, for the folders there are and the flags the backend knows', () => {
    const dir = project();
    const all = '--dir --migrationsDir --hooksDir --hooksWatch --automigrate';
    assert.deepEqual(backendFlags(dir, '/data', all), [
      '--dir=/data',
      `--migrationsDir=${join(dir, 'backend', 'pb_migrations')}`,
      `--hooksDir=${join(dir, 'backend', 'pb_hooks')}`,
      '--hooksWatch=false',
      '--automigrate=false',
    ]);
    assert.deepEqual(backendFlags(dir, '/data', '--dir'), ['--dir=/data'], 'a Go program without the JavaScript hooks');
  });
});

describe('harness backend: start, status, stop', () => {
  it('downloads PocketBase and jq once, checks them, starts on an empty database outside the repository, and stops', async () => {
    const dir = project();
    const { d, lines, net } = deps({ env: { APP_ORIGIN: 'http://localhost:4174' } });
    assert.equal(await main(['start'], dir, d), 0, lines.join('\n'));
    const state = readState(stateDir(d.cache, dir));
    assert.match(lines.join('\n'), new RegExp(`The throwaway backend is at http://127\\.0\\.0\\.1:${state.port}, for http://localhost:4174`));
    assert.ok(!state.dataDir.startsWith(dir) && !state.binary.startsWith(dir), 'nothing runs from inside the repository');
    const serve = JSON.parse(readFileSync(join(state.dataDir, 'serve.json'), 'utf8'));
    assert.deepEqual(serve, [
      'serve',
      `--http=127.0.0.1:${state.port}`,
      `--dir=${state.dataDir}`,
      `--migrationsDir=${join(dir, 'backend', 'pb_migrations')}`,
      `--hooksDir=${join(dir, 'backend', 'pb_hooks')}`,
      '--hooksWatch=false',
      '--automigrate=false',
      '--origins=http://localhost:4174',
    ]);
    const superuser = JSON.parse(readFileSync(join(state.dataDir, 'superuser.json'), 'utf8'));
    assert.deepEqual(superuser.slice(0, 4), ['superuser', 'upsert', 'admin@throwaway.invalid', 'throwaway-only-password']);
    assert.equal((await fetch(`${state.url}/api/health`)).status, 200);

    lines.length = 0;
    assert.equal(await main(['status'], dir, d), 0);
    assert.match(lines[0], new RegExp(`at ${state.url.replace(/\./g, '\\.')}`));

    // Started again: the first one is stopped, the downloads come from the cache.
    const downloads = net.asked.length;
    assert.equal(await main([], dir, d), 0);
    assert.equal(net.asked.length, downloads, 'the second start downloaded again');
    const again = readState(stateDir(d.cache, dir));
    await assert.rejects(fetch(`${state.url}/api/health`), 'the first backend still runs');

    lines.length = 0;
    assert.equal(await main(['stop'], dir, d), 0);
    assert.match(lines[0], /stopped, and its database removed/);
    await assert.rejects(fetch(`${again.url}/api/health`));
    assert.ok(!existsSync(again.dataDir));
    assert.equal(await main(['status'], dir, d), 1);
    assert.equal(await main(['stop'], dir, d), 0);
    assert.match(lines.at(-1), /No throwaway backend runs/);
    assert.deepEqual(net.asked, [
      'https://github.com/pocketbase/pocketbase/releases/download/v0.40.6/checksums.txt',
      'https://github.com/pocketbase/pocketbase/releases/download/v0.40.6/pocketbase_0.40.6_linux_amd64.zip',
      'https://github.com/jqlang/jq/releases/download/jq-1.8.2/jq-linux-amd64',
    ]);
  });

  it('builds a Go backend with the pinned Go, in the cache, and runs what it built', async () => {
    const dir = project({ dockerfile: 'FROM golang:1.24.2-alpine AS build\nFROM alpine:3.22\n', goMain: true });
    const { d, lines, net } = deps();
    assert.equal(await main(['start'], dir, d), 0, lines.join('\n'));
    const state = readState(stateDir(d.cache, dir));
    const build = JSON.parse(readFileSync(join(dir, 'backend', 'go-build.json'), 'utf8'));
    assert.deepEqual(build.args, ['build', '-o', state.binary, '.']);
    assert.equal(build.GOTOOLCHAIN, 'local');
    assert.equal(build.CGO_ENABLED, '0');
    assert.ok(build.GOPATH.startsWith(d.cache), 'modules go to the cache');
    assert.ok(state.binary.startsWith(d.cache));
    assert.ok(net.asked.includes('https://go.dev/dl/go1.24.2.linux-amd64.tar.gz'));
    assert.ok(!net.asked.some((u) => u.includes('pocketbase')), 'a Go backend needs no PocketBase download');
    assert.equal(await main(['stop'], dir, d), 0);
  });

  it('takes the newest patch release of a Go pin without one', async () => {
    const dir = project({ dockerfile: 'FROM golang:1.24\n', goMain: true });
    const { d, lines, net } = deps();
    assert.equal(await main(['start'], dir, d), 0, lines.join('\n'));
    assert.ok(net.asked.includes('https://go.dev/dl/go1.24.2.linux-amd64.tar.gz'), net.asked.join('\n'));
    assert.equal(await main(['stop'], dir, d), 0);
  });

  it('refuses a download whose checksum does not match, and installs nothing', async () => {
    const dir = project();
    const { d, lines } = deps({ fixtures: { badSum: true } });
    assert.equal(await main(['start'], dir, d), 1);
    assert.match(lines.join('\n'), /pocketbase_0\.40\.6_linux_amd64\.zip: the checksum doesn't match/);
    assert.ok(!existsSync(join(d.cache, 'tools', 'pocketbase-0.40.6-linux-amd64')));
    assert.equal(await main(['status'], dir, d), 1);
  });

  it('says so when the backend stops while starting, and leaves nothing running', async () => {
    const dir = project();
    const { d, lines } = deps({ env: { FAKE_EXIT: '1' } });
    assert.equal(await main(['start'], dir, d), 1);
    assert.match(lines.join('\n'), /The backend stopped while starting:\na migration failed/);
    assert.equal(readState(stateDir(d.cache, dir)), undefined);
  });

  it('refuses a port that is taken, and an unknown command', async () => {
    const { createServer } = await import('node:net');
    const server = createServer().listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const dir = project();
    const { d, lines } = deps({ env: { BACKEND_TEST_PORT: String(server.address().port) } });
    assert.equal(await main(['start'], dir, d), 1);
    assert.match(lines.join('\n'), /port \d+ is taken/);
    server.close();
    assert.equal(await main(['restart'], dir, d), 1);
    assert.equal(await main(['smoke'], dir, d), 1);
    assert.match(lines.at(-1), /run harness backend start first/);
  });
});
