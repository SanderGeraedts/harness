// Only the Engineer runs the infrastructure commands (G-0026, G-0027):
// - inside a project that has .harness/engineers, the signed-in account must be listed there;
// - anywhere, it must have admin rights on the private infrastructure repository.
import { readEngineers } from '../role.mjs';

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// The first check, before any setting is read: who is signed in, and whether this project
// lists them. Returns the login.
export function requireListedEngineer({ cwd, getLogin }) {
  const login = getLogin(cwd);
  if (!login) throw new Error('only the Engineer may change the infrastructure (G-0026), and gh is not signed in: run gh auth login');
  const listed = readEngineers(cwd);
  if (listed.length && !listed.some((l) => same(l, login)))
    throw new Error(`only the Engineer may change the infrastructure (G-0026): ${login} is not in this project's .harness/engineers`);
  return login;
}

// The repository as `gh repo view` sees it, or undefined when it doesn't exist or can't be seen.
export function viewRepo(repo, gh) {
  try {
    return JSON.parse(gh(['repo', 'view', repo, '--json', 'visibility,isEmpty,viewerPermission']));
  } catch {
    return undefined;
  }
}

// The second check: admin rights on the repository. Returns what `viewRepo` found.
export function requireAdmin({ repo, login, gh }) {
  const found = viewRepo(repo, gh);
  if (!found) throw new Error(`only the Engineer may change the infrastructure (G-0026): ${login} can't see ${repo}`);
  if (found.viewerPermission !== 'ADMIN')
    throw new Error(`only the Engineer may change the infrastructure (G-0026): ${login} has no admin rights on ${repo}`);
  if (String(found.visibility).toUpperCase() !== 'PRIVATE')
    throw new Error(`${repo} is ${String(found.visibility).toLowerCase()}: the infrastructure repository must be private (G-0026). Its visibility is the Engineer's to change; the harness never changes it.`);
  return found;
}
