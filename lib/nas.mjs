// harness nas: calls the TrueNAS API as the agents' own admin user, over the LAN (G-0022).
//
//   harness nas --fingerprint
//   harness nas <method> [params-json] [--job] [--confirmed]
//
//   harness nas system.info
//   harness nas app.query '[[["name","=","<app>"]]]'
//   harness nas app.redeploy '["<app>"]' --job
//
// Reads TRUENAS_HOST, TRUENAS_API_KEY and TRUENAS_CERT_SHA256 from the environment; none of
// them is ever committed. The API key is sent only after the NAS's certificate matches the
// pinned fingerprint, so a machine that intercepts TLS can't capture it.
//
// Destructive methods (see isDestructive) refuse to run without --confirmed. Claude Code
// asks a human before any command containing --confirmed (.claude/settings.json, written
// by harness sync), so an agent must ask the Engineer first.
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

const USAGE = 'Usage: harness nas <method> [params-json] [--job] [--confirmed] | --fingerprint';

// Runs one call and exits the process: the tool is a command, not a library.
export async function main(args, env = process.env) {
  const flag = (f) => args.includes(f);
  const [method, paramsJson] = args.filter((a) => !a.startsWith('--'));
  const { TRUENAS_HOST: host, TRUENAS_API_KEY: key, TRUENAS_CERT_SHA256: pin } = env;

  const fail = (msg, code = 1) => {
    console.error(msg);
    process.exit(code);
  };
  if (method && isDestructive(method) && !flag('--confirmed'))
    fail(`${method} is destructive (G-0022): ask the Engineer in chat, then rerun with --confirmed.`, 2);
  if (!host) fail('Set TRUENAS_HOST (the address of the NAS on the LAN). See G-0022.');

  const { default: WebSocket } = await import('ws');

  const fingerprintOf = (ws) => {
    const cert = ws._socket?.getPeerCertificate?.();
    if (!cert?.raw) return undefined;
    return createHash('sha256').update(cert.raw).digest('hex').toUpperCase().match(/../g).join(':');
  };
  const normalise = (fp) => fp.replace(/[^0-9a-f]/gi, '').toUpperCase();

  function connect() {
    return new Promise((resolve, reject) => {
      // The NAS uses its own self-signed certificate; trust comes from the pinned fingerprint.
      const ws = new WebSocket(`wss://${host}/api/current`, { rejectUnauthorized: false, handshakeTimeout: 10000 });
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  }

  let nextId = 1;
  const pending = new Map();
  function call(ws, m, params = []) {
    const id = nextId++;
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: m, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  const ws = await connect().catch((e) => fail(`Can't reach wss://${host}/api/current: ${e.message}`));
  const seen = fingerprintOf(ws);
  if (flag('--fingerprint')) {
    console.log(seen ?? 'no certificate');
    ws.close();
    process.exit(0);
  }
  if (!pin) fail('Set TRUENAS_CERT_SHA256 (run with --fingerprint, check it in the TrueNAS UI).');
  if (!seen || normalise(seen) !== normalise(pin)) {
    ws.terminate();
    fail(`Certificate mismatch: expected ${pin}, got ${seen}. Not sending the API key.`);
  }
  if (!key) fail('Set TRUENAS_API_KEY.');
  if (!method) fail(USAGE);

  let params = [];
  try {
    params = paramsJson ? JSON.parse(paramsJson) : [];
  } catch (e) {
    fail(`params must be a JSON array: ${e.message}`);
  }
  if (!Array.isArray(params)) fail('params must be a JSON array, like \'["<app>"]\'.');

  ws.on('message', (data) => {
    const msg = JSON.parse(String(data));
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(Object.assign(new Error(msg.error.data?.reason ?? msg.error.message), { detail: msg.error }));
    else p.resolve(msg.result);
  });

  try {
    const ok = await call(ws, 'auth.login_with_api_key', [key]);
    if (ok !== true) fail('API key refused.');
    let result = await call(ws, method, params);
    if (flag('--job') && typeof result === 'number') {
      for (;;) {
        const [job] = await call(ws, 'core.get_jobs', [[['id', '=', result]]]);
        if (job && ['SUCCESS', 'FAILED', 'ABORTED'].includes(job.state)) {
          if (job.state !== 'SUCCESS') fail(`job ${result} ${job.state}: ${job.error ?? ''}`);
          result = job.result;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    fail(`${method} failed: ${e.message}${e.detail ? `\n${JSON.stringify(e.detail)}` : ''}`);
  } finally {
    ws.close();
  }
}
