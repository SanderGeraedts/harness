import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { connectNas, fingerprintOfCertificate, normaliseFingerprint, openNas } from '../lib/nas-client.mjs';
import { isDestructive, parseNasArgs } from '../lib/nas.mjs';
import { HARNESS_ROOT } from '../lib/paths.mjs';

// G-0027: destructive TrueNAS calls refuse to run without --confirmed, before connecting.
const run = (...args) =>
  spawnSync(process.execPath, [join(HARNESS_ROOT, 'bin/harness.mjs'), 'nas', ...args], {
    encoding: 'utf8',
    // Nothing listens on the discard port, so a call that gets through fails to connect.
    env: { ...process.env, TRUENAS_HOST: 'localhost:9', TRUENAS_API_KEY: '', TRUENAS_CERT_SHA256: '' },
    timeout: 30000,
  });

const DESTRUCTIVE = [
  'pool.dataset.delete', 'app.delete', 'pool.snapshot.delete', 'pool.snapshot.rollback',
  'zfs.snapshot.rollback', 'zfs.snapshot.delete', 'pool.snapshot.clone', 'user.update', 'api_key.create',
  'system.reboot', 'system.shutdown', 'update.update', 'filesystem.put', 'interface.commit',
  'system.general.update', 'pool.export', 'disk.wipe', 'app.rollback', 'certificate.create',
  'replication.run', 'cloudsync.sync', 'docker.update', 'boot.attach', 'config.reset',
];
const ALLOWED = [
  'system.info', 'app.query', 'app.redeploy', 'app.update', 'app.upgrade', 'app.stop', 'app.create',
  'pool.dataset.query', 'pool.dataset.create', 'pool.snapshot.create', 'zfs.snapshot.create',
  'pool.snapshottask.create', 'core.get_jobs', 'core.ping', 'app.config', 'app.start',
];

describe('nas', () => {
  it('knows which methods are destructive', () => {
    for (const m of DESTRUCTIVE) assert.equal(isDestructive(m), true, m);
    for (const m of ALLOWED) assert.equal(isDestructive(m), false, m);
  });

  it('refuses a destructive method without --confirmed, before connecting', () => {
    for (const m of ['pool.dataset.delete', 'pool.snapshot.rollback', 'user.update', 'system.reboot']) {
      const r = run(m, '[]');
      assert.equal(r.status, 2, `${m}: ${r.stderr}`);
      assert.match(r.stderr, /is destructive \(G-0027\): ask the Engineer/);
    }
  });

  it('refuses a destructive method with --remote too, before starting anything', () => {
    // No gh is reachable with an empty PATH: the refusal comes before it would be needed.
    const r = spawnSync(process.execPath, [join(HARNESS_ROOT, 'bin/harness.mjs'), 'nas', '--remote', 'pool.dataset.delete', '["x"]'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '', Path: '' },
    });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /pool\.dataset\.delete is destructive \(G-0027\)/);
  });

  it('lets other methods, and a confirmed destructive one, through to the connection', () => {
    for (const args of [['system.info'], ['pool.snapshot.create', '[]'], ['app.delete', '["x"]', '--confirmed'], ['--fingerprint']]) {
      const r = run(...args);
      assert.equal(r.status, 1, `${args.join(' ')}: ${r.stderr}`);
      assert.match(r.stderr, /Can't reach wss:\/\/localhost:9\/api\/current/);
    }
  });

  it('asks for the host before anything else', () => {
    const r = spawnSync(process.execPath, [join(HARNESS_ROOT, 'bin/harness.mjs'), 'nas', 'system.info'], {
      encoding: 'utf8',
      env: { ...process.env, TRUENAS_HOST: '' },
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Set TRUENAS_HOST/);
  });

  it('reads its arguments', () => {
    assert.deepEqual(parseNasArgs(['app.query', '[["x"]]', '--job', '--remote']), {
      method: 'app.query', params: [['x']], job: true, confirmed: false, remote: true, fingerprint: false,
    });
    assert.deepEqual(parseNasArgs(['core.ping']).params, []);
    assert.throws(() => parseNasArgs(['app.query', '{"a":1}']), /params must be a JSON array/);
    assert.throws(() => parseNasArgs(['app.query', 'nope']), /params must be a JSON array: /);
  });
});

// A WebSocket stand-in: answers calls from `answers`, keyed by method.
function fakeSocket({ cert = Buffer.from('a certificate'), answers = {} } = {}) {
  const sent = [];
  class Fake extends EventEmitter {
    constructor(url, options) {
      super();
      this.url = url;
      this.options = options;
      this._socket = { getPeerCertificate: () => ({ raw: cert }) };
      this.closed = false;
      setImmediate(() => this.emit('open'));
    }
    send(text) {
      const msg = JSON.parse(text);
      sent.push(msg);
      const answer = answers[msg.method];
      const reply = typeof answer === 'function' ? answer(msg.params) : answer;
      setImmediate(() => this.emit('message', JSON.stringify(reply?.error ? { id: msg.id, error: reply.error } : { id: msg.id, result: reply })));
    }
    close() {
      this.closed = true;
    }
    terminate() {
      this.closed = true;
    }
  }
  return { WebSocket: Fake, sent };
}

describe('the NAS client', () => {
  const cert = Buffer.from('a certificate');
  const pin = fingerprintOfCertificate(cert);

  it('reads the fingerprint before sending anything', async () => {
    const { WebSocket, sent } = fakeSocket({ cert });
    const nas = await openNas('nas.example', { WebSocket });
    assert.equal(nas.fingerprint, pin);
    assert.match(pin, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    assert.deepEqual(sent, []);
  });

  it('never sends the key when the certificate does not match', async () => {
    const { WebSocket, sent } = fakeSocket({ cert });
    await assert.rejects(connectNas({ host: 'nas.example', key: 'the-key', pin: 'AA:BB' }, { WebSocket }), /Certificate mismatch: expected AA:BB, got .*\. Not sending the API key\./);
    assert.deepEqual(sent, []);
  });

  it('accepts the pin in any notation, signs in, and makes several calls', async () => {
    const { WebSocket, sent } = fakeSocket({ cert, answers: { 'auth.login_with_api_key': true, 'core.ping': 'pong', 'system.info': { version: 'x' } } });
    const nas = await connectNas({ host: 'nas.example', key: 'the-key', pin: normaliseFingerprint(pin).toLowerCase() }, { WebSocket });
    assert.equal(await nas.call('core.ping'), 'pong');
    assert.deepEqual(await nas.call('system.info'), { version: 'x' });
    assert.deepEqual(sent.map((m) => m.method), ['auth.login_with_api_key', 'core.ping', 'system.info']);
    nas.close();
  });

  it('waits for a job and returns its result, or says why it failed', async () => {
    let polls = 0;
    const { WebSocket } = fakeSocket({
      cert,
      answers: {
        'auth.login_with_api_key': true,
        'app.create': 7,
        'app.stop': 8,
        'core.get_jobs': ([[[, , id]]]) => (id === 7 ? [{ id, state: ++polls < 2 ? 'RUNNING' : 'SUCCESS', result: { name: 'x' } }] : [{ id, state: 'FAILED', error: 'no such app' }]),
      },
    });
    const nas = await connectNas({ host: 'h', key: 'k', pin }, { WebSocket, jobPoll: 1 });
    assert.deepEqual(await nas.job('app.create', [{}]), { name: 'x' });
    await assert.rejects(nas.job('app.stop', ['x']), /job 8 FAILED: no such app/);
  });

  it('refuses a key that is turned down, and calls before signing in', async () => {
    const { WebSocket } = fakeSocket({ cert, answers: { 'auth.login_with_api_key': false } });
    await assert.rejects(connectNas({ host: 'h', key: 'k', pin }, { WebSocket }), /API key refused/);
    const nas = await openNas('h', { WebSocket });
    await assert.rejects(nas.call('core.ping'), /sign in before calling/);
  });

  it('turns an API error into an error with its reason', async () => {
    const { WebSocket } = fakeSocket({ cert, answers: { 'auth.login_with_api_key': true, 'app.query': { error: { message: 'Method call error', data: { reason: 'bad filter' } } } } });
    const nas = await connectNas({ host: 'h', key: 'k', pin }, { WebSocket });
    await assert.rejects(nas.call('app.query', [[]]), (e) => e.message === 'bad filter' && e.detail.data.reason === 'bad filter');
  });
});
