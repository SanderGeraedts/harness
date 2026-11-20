// harness role: `engineer` when the signed-in GitHub account is listed in
// .harness/engineers, otherwise `requester` (G-0007). A missing file, a missing `gh` or a
// `gh` that isn't signed in all mean `requester`.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { read } from './frontmatter.mjs';

export const ENGINEERS_FILE = '.harness/engineers';

export function readEngineers(projectDir) {
  const path = join(projectDir, ENGINEERS_FILE);
  if (!existsSync(path)) return [];
  return read(path)
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim().replace(/^@/, ''))
    .filter(Boolean);
}

export function ghLogin(cwd = process.cwd()) {
  try {
    const out = execFileSync('gh', ['api', 'user', '--jq', '.login'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
    });
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function resolveRole(projectDir, getLogin = ghLogin) {
  const engineers = readEngineers(projectDir).map((l) => l.toLowerCase());
  if (engineers.length === 0) return 'requester';
  const login = getLogin(projectDir);
  return login && engineers.includes(login.toLowerCase()) ? 'engineer' : 'requester';
}

export function main(args, cwd = process.cwd()) {
  console.log(resolveRole(cwd));
  return 0;
}
