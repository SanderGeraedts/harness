// Where the private infrastructure repository is (G-0026). It is a setting, never written
// into the harness or a project:
//
//   HARNESS_INFRA_REPO           owner/name; wins over the file
//   HARNESS_INFRA_ENVIRONMENT    the GitHub environment's name (default Prod)
//   <config dir>/harness/infra.json
//                                written by `harness infra init --repo owner/name`
//
// The config dir is HARNESS_CONFIG_DIR, else XDG_CONFIG_HOME, else APPDATA on Windows, else
// ~/.config.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_ENVIRONMENT = 'Prod';
export const REPO = /^[A-Za-z0-9-]+\/[\w.-]+$/;
export const ENVIRONMENT = /^[\w.-]{1,255}$/;

export function settingsFile(env = process.env) {
  const base = env.HARNESS_CONFIG_DIR || env.XDG_CONFIG_HOME || (process.platform === 'win32' && env.APPDATA) || join(homedir(), '.config');
  return join(base, 'harness', 'infra.json');
}

export function readSettings(env = process.env) {
  const file = settingsFile(env);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} isn't JSON: fix or remove it`);
  }
}

export function writeSettings(values, env = process.env) {
  const file = settingsFile(env);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...readSettings(env), ...values }, null, 2)}\n`);
  return file;
}

export const NO_REPO = 'No private infrastructure repository is set (G-0026). Set it once with harness infra init --repo <owner>/<name>, or set HARNESS_INFRA_REPO.';

// The repository and environment to use; `given` are the command's flags. Throws with a plain
// message when no repository is set.
export function infraSettings({ repo, environment } = {}, env = process.env) {
  const saved = readSettings(env);
  const found = repo || env.HARNESS_INFRA_REPO || saved.repo;
  if (!found) throw new Error(NO_REPO);
  if (!REPO.test(found)) throw new Error(`"${found}" isn't a repository as owner/name`);
  const environmentName = environment || env.HARNESS_INFRA_ENVIRONMENT || saved.environment || DEFAULT_ENVIRONMENT;
  if (!ENVIRONMENT.test(environmentName)) throw new Error(`"${environmentName}" isn't an environment name`);
  return { repo: found, environment: environmentName };
}
