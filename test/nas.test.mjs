import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { isDestructive } from '../lib/nas.mjs';
import { HARNESS_ROOT } from '../lib/paths.mjs';

// G-0022: destructive TrueNAS calls refuse to run without --confirmed, before connecting.
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
  'pool.snapshottask.create', 'core.get_jobs',
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
      assert.match(r.stderr, /is destructive \(G-0022\): ask the Engineer/);
    }
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
});
