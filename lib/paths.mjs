import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The harness package this code runs from: the checkout, or the copy in node_modules.
export const HARNESS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGE_NAME = '@sandergeraedts/harness';
export const INSTALLED_PATH = `node_modules/${PACKAGE_NAME}`;
export const GLOBAL_DECISIONS_DIR = join(HARNESS_ROOT, 'decisions');

export const harnessVersion = () => JSON.parse(readFileSync(join(HARNESS_ROOT, 'package.json'), 'utf8')).version;

// True when `dir` is the harness's own repository rather than a project that installs it.
export function isHarnessRepo(dir) {
  const pkg = join(dir, 'package.json');
  if (!existsSync(pkg)) return false;
  try {
    return JSON.parse(readFileSync(pkg, 'utf8')).name === PACKAGE_NAME;
  } catch {
    return false;
  }
}
