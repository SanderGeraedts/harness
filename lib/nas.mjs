// harness nas: calls the TrueNAS API (G-0027).
//
//   harness nas --fingerprint
//   harness nas <method> [params-json] [--job] [--confirmed]
//   harness nas --remote <method> [params-json] [--job] [--confirmed]
//
//   harness nas --remote core.ping
//   harness nas --remote app.query '[[["name","=","<app>"]]]'
//   harness nas --remote app.redeploy '["<app>"]' --job
//
// --remote starts the `nas` workflow of the private infrastructure repository (G-0026),
// which runs this same command on the runner on the NAS, with the key from the GitHub
// environment; it waits for the run and prints what the run recorded. No key is needed on
// this machine. Only the Engineer may do it.
//
// Without --remote it runs here, with TRUENAS_HOST, TRUENAS_API_KEY and TRUENAS_CERT_SHA256
// from the environment, on the home network. None of them is ever committed or printed.
//
// Destructive methods (see isDestructive) refuse to run without --confirmed, either way and
// before anything is started. Claude Code asks a human before any command containing
// --confirmed (.claude/settings.json, written by harness sync), so an agent must ask the
// Engineer first.
import { NasError, isDestructive, nasEnv, openNas } from './nas-client.mjs';

export { isDestructive } from './nas-client.mjs';

export const USAGE = 'Usage: harness nas [--remote] <method> [params-json] [--job] [--confirmed] | --fingerprint';

export const destructiveMessage = (method) => `${method} is destructive (G-0027): ask the Engineer in chat, then rerun with --confirmed.`;

// Reads the arguments: { method, params, job, confirmed, remote, fingerprint }. Throws on a
// malformed parameter list.
export function parseNasArgs(args) {
  const flag = (f) => args.includes(f);
  const [method, paramsJson] = args.filter((a) => !a.startsWith('--'));
  let params = [];
  if (paramsJson !== undefined) {
    try {
      params = JSON.parse(paramsJson);
    } catch (e) {
      throw new NasError('params', `params must be a JSON array: ${e.message}`);
    }
    if (!Array.isArray(params)) throw new NasError('params', 'params must be a JSON array, like \'["<app>"]\'.');
  }
  return { method, params, job: flag('--job'), confirmed: flag('--confirmed'), remote: flag('--remote'), fingerprint: flag('--fingerprint') };
}

// Runs one call here, against the NAS on the LAN, and returns { code, stdout, stderr }:
// code 0, 1 on a failure, 2 for a refused destructive call. Prints nothing.
export async function runLocal(o, env = process.env) {
  const fail = (stderr, code = 1) => ({ code, stdout: '', stderr });
  if (o.method && isDestructive(o.method) && !o.confirmed) return fail(destructiveMessage(o.method), 2);
  const { host, key, pin } = nasEnv(env);
  let client;
  try {
    client = await openNas(host);
    if (o.fingerprint) {
      client.close();
      return { code: 0, stdout: client.fingerprint ?? 'no certificate', stderr: '' };
    }
    client.verify(pin);
    if (!key) throw new NasError('key', 'Set TRUENAS_API_KEY.');
    if (!o.method) throw new NasError('usage', USAGE);
    await client.login(key);
  } catch (e) {
    client?.close();
    return fail(e.message);
  }
  try {
    const result = o.job ? await client.job(o.method, o.params) : await client.call(o.method, o.params);
    return { code: 0, stdout: JSON.stringify(result, null, 2), stderr: '' };
  } catch (e) {
    return fail(`${o.method} failed: ${e.message}${e.detail ? `\n${JSON.stringify(e.detail)}` : ''}`);
  } finally {
    client.close();
  }
}

// Prints a result as the command does.
export function report({ code, stdout, stderr }) {
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
  return code;
}

export async function main(args, env = process.env, deps = {}) {
  // First of all, before the parameters are read and before anything is started or connected.
  const [method] = args.filter((a) => !a.startsWith('--'));
  if (method && isDestructive(method) && !args.includes('--confirmed')) return report({ code: 2, stderr: destructiveMessage(method) });
  let o;
  try {
    o = parseNasArgs(args);
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  if (o.remote) {
    if (!o.method) return report({ code: 1, stderr: USAGE });
    const { remoteNas } = await import('./infra.mjs');
    return remoteNas(o, { env, ...deps });
  }
  return report(await runLocal(o, env));
}
