// The TrueNAS API client that `harness nas` and the infrastructure commands build on
// (G-0027). It connects, checks the NAS's certificate against the pinned fingerprint, signs
// in, and then makes any number of calls. It never exits the process and never prints: the
// commands on top of it decide what to say.
//
// The API key is sent only after the certificate matches the pinned fingerprint, so a
// machine that intercepts TLS can't capture it.
import { createHash } from 'node:crypto';

const DESTRUCTIVE = [
  // deleting or overwriting data
  /\.delete$/, /\.wipe$/, /\.destroy$/, /\.rollback$/, /\.clear$/, /\.purge$/,
  /^pool\.(export|detach|offline|remove|replace|expand)$/,
  /^pool\.dataset\.(delete|destroy_snapshots|promote|change_key|lock)$/,
  // snapshots: creating one is a backup and runs freely; deleting, rolling back or cloning
  // one still asks
  /^(zfs|pool)\.snapshot\.(delete|destroy|rollback|clone|hold|release)$/, /^disk\./, /^filesystem\.(put|setacl|setperm|chown)$/,
  /^replication\.(run|restore)$/, /^cloudsync\.(sync|restore)$/, /^rsynctask\.run$/,
  // who can get in, and how
  /^(user|group|privilege|api_key|auth|ssh|kerberos|directoryservices|ldap|activedirectory|idmap|certificate|certificateauthority|acme|kmip|truecommand|tn_connect)\./,
  /^system\.general\.update$/, /^system\.security\./, /^system\.(reboot|shutdown)$/,
  /^(interface|network|staticroute|ipmi)\./,
  // the OS itself
  /^(update|boot|failover|config)\./, /^system\.advanced\.update$/,
  // apps: removing one, or rolling back its data
  /^app\.(delete|rollback|convert_to_custom)$/, /^docker\.(update|backup_to_pool|restore_back)$/,
];
export const isDestructive = (method) => DESTRUCTIVE.some((re) => re.test(method));

export const normaliseFingerprint = (fp) => String(fp ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase();

export const fingerprintOfCertificate = (raw) => createHash('sha256').update(raw).digest('hex').toUpperCase().match(/../g).join(':');

// An error the client raises; `code` says which step failed.
export class NasError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

// Opens the connection and reads the certificate's fingerprint; sends nothing yet.
// `WebSocket` is injectable for tests.
export async function openNas(host, { WebSocket, handshakeTimeout = 10000, jobPoll = 1000 } = {}) {
  if (!host) throw new NasError('host', 'Set TRUENAS_HOST (the address of the NAS on the LAN). See G-0027.');
  WebSocket ??= (await import('ws')).default;
  const url = `wss://${host}/api/current`;
  const ws = await new Promise((resolve, reject) => {
    // The NAS uses its own self-signed certificate; trust comes from the pinned fingerprint.
    const socket = new WebSocket(url, { rejectUnauthorized: false, handshakeTimeout });
    socket.once('open', () => resolve(socket));
    socket.once('error', (e) => reject(new NasError('connect', `Can't reach ${url}: ${e.message}`)));
  });
  const raw = ws._socket?.getPeerCertificate?.()?.raw;
  const fingerprint = raw ? fingerprintOfCertificate(raw) : undefined;

  let nextId = 1;
  const pending = new Map();
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new NasError('call', msg.error.data?.reason ?? msg.error.message, msg.error));
    else p.resolve(msg.result);
  });
  ws.on('close', () => {
    for (const p of pending.values()) p.reject(new NasError('closed', 'the connection to the NAS closed'));
    pending.clear();
  });

  let verified = false;
  let signedIn = false;
  const send = (method, params = []) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  };

  const client = {
    fingerprint,
    // Throws unless the certificate matches the pinned fingerprint; closes the connection then.
    verify(pin) {
      if (!pin) throw new NasError('pin', 'Set TRUENAS_CERT_SHA256 (run harness nas --fingerprint, check it in the TrueNAS UI).');
      if (!fingerprint || normaliseFingerprint(fingerprint) !== normaliseFingerprint(pin)) {
        ws.terminate();
        throw new NasError('mismatch', `Certificate mismatch: expected ${pin}, got ${fingerprint}. Not sending the API key.`);
      }
      verified = true;
      return client;
    },
    async login(key) {
      if (!verified) throw new NasError('pin', 'verify the certificate before signing in');
      if (!key) throw new NasError('key', 'Set TRUENAS_API_KEY.');
      const ok = await send('auth.login_with_api_key', [key]);
      if (ok !== true) throw new NasError('login', 'API key refused.');
      signedIn = true;
      return client;
    },
    call(method, params = []) {
      if (!signedIn) return Promise.reject(new NasError('login', 'sign in before calling the API'));
      if (!Array.isArray(params)) return Promise.reject(new NasError('params', 'params must be a JSON array, like \'["<app>"]\'.'));
      return send(method, params);
    },
    // Waits for a job the NAS started and returns its result; throws when it didn't succeed.
    async waitJob(id) {
      for (;;) {
        const [job] = await client.call('core.get_jobs', [[['id', '=', id]]]);
        if (job && ['SUCCESS', 'FAILED', 'ABORTED'].includes(job.state)) {
          if (job.state !== 'SUCCESS') throw new NasError('job', `job ${id} ${job.state}: ${job.error ?? ''}`.trim(), job);
          return job.result;
        }
        await new Promise((r) => setTimeout(r, jobPoll));
      }
    },
    // A call that starts a job, and waits for it.
    async job(method, params = []) {
      const id = await client.call(method, params);
      return typeof id === 'number' ? client.waitJob(id) : id;
    },
    close() {
      ws.close();
    },
  };
  return client;
}

// Opens, verifies and signs in: the usual way in.
export async function connectNas({ host, key, pin }, options) {
  const client = await openNas(host, options);
  try {
    client.verify(pin);
    await client.login(key);
  } catch (e) {
    client.close();
    throw e;
  }
  return client;
}

// The NAS settings from an environment, as the local commands and the runner's jobs read them.
export const nasEnv = (env = process.env) => ({
  host: env.TRUENAS_HOST,
  key: env.TRUENAS_API_KEY,
  pin: env.TRUENAS_CERT_SHA256,
  appsDataset: env.TRUENAS_APPS_DATASET,
});
