// harness create <name>: spins up a new project (G-0024): the app from the template in
// template/, the harness installed and initialised, CI and auto-merge wired, the first
// decisions and tasks recorded, a first commit, and (unless --no-github) a GitHub repository
// whose default branch is protected once its first CI run is green.
//
// Only the Engineer may run it (G-0007, G-0024):
// - from inside a project that has .harness/engineers, the signed-in GitHub account must be
//   listed there, and the new project gets the same Engineers (plus any --engineer);
// - anywhere else, --engineer names the new project's Engineers, and the signed-in account
//   must be one of them.
//
// Hosting and the backend are not created here yet; they are added as further steps.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { HARNESS_ROOT, INSTALLED_PATH, harnessVersion } from './paths.mjs';
import { ghLogin, readEngineers } from './role.mjs';

export const TEMPLATE_DIR = join(HARNESS_ROOT, 'template');
export const HARNESS_REPO = 'SanderGeraedts/harness';
export const REQUIRED_CHECK = 'checks / checks';

// Font stacks that need no font files: they work offline and under a strict CSP.
export const FONTS = {
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  rounded: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Nunito, 'Arial Rounded MT Bold', system-ui, sans-serif",
  mono: "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace",
};
export const DEFAULTS = { accent: '#2f6fed', font: 'system', language: 'en' };

export const USAGE = `harness create <name> [options]

  --dir <path>           where to create it (default: ./<name>, or next to the current
                         repository when run inside one)
  --title <text>         the name people see (default: made from <name>)
  --purpose <text>       what the project is for, in a sentence
  --accent <#rrggbb>     the accent colour (default: ${DEFAULTS.accent})
  --font <name>          ${Object.keys(FONTS).join(' | ')} (default: ${DEFAULTS.font})
  --language <code>      the interface language, e.g. en or nl (default: ${DEFAULTS.language})
  --engineer <login>     a GitHub login of an Engineer; repeat for more
  --private | --public   the repository's visibility (default: private)
  --git-name <name>      the author of the first commit, and the new repository's
  --git-email <address>  user.name and user.email (default: git's own configuration)
  --no-github            stop after the first local commit
  --harness-ref <ref>    the harness tag, branch or commit to install and to pin the
                         workflows to (default: v<this version>)
  --harness-package <spec>
                         install the harness from this package spec instead (for tests)

Asks for the purpose, look and language that weren't given, when run in a terminal.
`;

const VALUE_FLAGS = ['dir', 'title', 'purpose', 'accent', 'font', 'language', 'git-name', 'git-email', 'harness-ref', 'harness-package'];

// Turns the arguments into options, without judging them. Throws on a flag it doesn't know.
export function parseArgs(args) {
  const o = { engineers: [], visibility: 'private', github: true };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const [flag, inline] = a.slice(2).split(/=(.*)/s);
    const value = () => {
      const v = inline ?? args[++i];
      if (v === undefined || (inline === undefined && v.startsWith('--'))) throw new Error(`--${flag} needs a value`);
      return v;
    };
    if (VALUE_FLAGS.includes(flag)) o[flag.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value();
    else if (flag === 'engineer') o.engineers.push(...value().split(',').map((l) => l.trim().replace(/^@/, '')).filter(Boolean));
    else if (flag === 'private' || flag === 'public') o.visibility = flag;
    else if (flag === 'no-github') o.github = false;
    else throw new Error(`unknown option --${flag}`);
  }
  if (positional.length > 1) throw new Error(`one name, not ${positional.length}: ${positional.join(' ')}`);
  o.name = positional[0];
  return o;
}

// "my-first-app" → "My first app".
export const titleFromName = (name) => name.charAt(0).toUpperCase() + name.slice(1).replaceAll('-', ' ');

// Without repeats, whatever their case; the first spelling stays.
export const unique = (logins) => logins.filter((l, i) => logins.findIndex((x) => x.toLowerCase() === l.toLowerCase()) === i);

// The root of the git repository `dir` is in, or undefined.
export function repositoryRoot(dir) {
  for (let at = resolve(dir); ; at = dirname(at)) {
    if (existsSync(join(at, '.git'))) return at;
    if (dirname(at) === at) return undefined;
  }
}

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Checks the options and fills in the defaults. Throws with what is wrong.
export function resolveOptions(o, { cwd = process.cwd(), version = harnessVersion() } = {}) {
  if (!o.name) throw new Error('name the project: harness create <name>');
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(o.name) || o.name.endsWith('-'))
    throw new Error(`"${o.name}" isn't a project name: lower-case letters, digits and hyphens, e.g. my-project`);
  const purpose = oneLine(o.purpose);
  if (!purpose) throw new Error('say what the project is for: --purpose "..."');
  if (purpose.length > 300) throw new Error('keep the purpose to one sentence (300 characters at most)');
  const title = oneLine(o.title) || titleFromName(o.name);
  if (title.length > 60) throw new Error('keep the title to 60 characters at most');
  const accent = (o.accent ?? DEFAULTS.accent).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(accent)) throw new Error(`"${o.accent}" isn't a colour like ${DEFAULTS.accent}`);
  const font = o.font ?? DEFAULTS.font;
  if (!Object.hasOwn(FONTS, font)) throw new Error(`"${font}" isn't a font: ${Object.keys(FONTS).join(', ')}`);
  const language = o.language ?? DEFAULTS.language;
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) throw new Error(`"${language}" isn't a language code like en, nl or pt-BR`);
  const harnessRef = o.harnessRef ?? `v${version}`;
  if (!/^[\w./-]+$/.test(harnessRef)) throw new Error(`"${harnessRef}" isn't a tag, branch or commit`);
  for (const l of o.engineers) if (!/^[A-Za-z0-9-]+$/.test(l)) throw new Error(`"${l}" isn't a GitHub login`);
  const gitName = o.gitName === undefined ? undefined : oneLine(o.gitName);
  const gitEmail = o.gitEmail === undefined ? undefined : oneLine(o.gitEmail);
  if (gitName === '') throw new Error('--git-name is empty');
  if (gitEmail !== undefined && !/^[^\s@<>]+@[^\s@<>]+$/.test(gitEmail)) throw new Error(`"${o.gitEmail}" isn't an e-mail address`);
  // A project made from inside another repository goes next to it, never into it.
  const inside = repositoryRoot(cwd);
  return {
    name: o.name,
    dir: o.dir !== undefined ? resolve(cwd, o.dir) : join(inside ? dirname(inside) : resolve(cwd), o.name),
    title,
    purpose,
    accent,
    font,
    language,
    engineers: unique(o.engineers),
    gitName,
    gitEmail,
    visibility: o.visibility,
    github: o.github,
    harnessRef,
    harnessPackage: o.harnessPackage ?? `github:${HARNESS_REPO}#${harnessRef}`,
  };
}

// Black or white, whichever reads better on the colour (WCAG contrast).
export function onAccent(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#111111';
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// What each __PLACEHOLDER__ in the template becomes. The _JSON forms are quoted string
// literals, for code and front matter; the _HTML forms are escaped for markup.
export function placeholders(o, date = new Date().toISOString().slice(0, 10)) {
  return {
    PROJECT_NAME: o.name,
    PROJECT_TITLE: o.title,
    PROJECT_TITLE_JSON: JSON.stringify(o.title),
    PROJECT_TITLE_HTML: escapeHtml(o.title),
    PROJECT_PURPOSE: o.purpose,
    PROJECT_PURPOSE_JSON: JSON.stringify(o.purpose),
    PROJECT_PURPOSE_HTML: escapeHtml(o.purpose),
    ACCENT: o.accent,
    ON_ACCENT: onAccent(o.accent),
    FONT: o.font,
    FONT_STACK: FONTS[o.font],
    LANGUAGE: o.language,
    HARNESS_REF: o.harnessRef,
    DATE: date,
  };
}

const PLACEHOLDER = /__([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)__/g;

// Replaces the placeholders it knows, in one pass, and leaves every other __NAME__ alone
// (the app has build-time constants that look the same).
export const fill = (text, values) => text.replace(PLACEHOLDER, (all, key) => (Object.hasOwn(values, key) ? values[key] : all));

// The placeholders still in a text that `values` would fill: none, after fill.
export const unfilled = (text, values) => [...new Set([...text.matchAll(PLACEHOLDER)].filter((m) => Object.hasOwn(values, m[1])).map((m) => m[0]))];

function walk(dir, rel = '') {
  return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const path = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? walk(dir, path) : [path];
  });
}

// Tasks the template carries only for some answers.
const CONDITIONAL = [{ file: 'docs/tasks/T-0003-translate-the-interface.md', when: (o) => !/^en(-|$)/.test(o.language) }];

// Copies the template into `dir` and fills it in. A top-level `_name` becomes `.name`: a
// package can't carry a .gitignore, and a .github folder here would be the harness's own.
// Returns the files written, relative to `dir`.
export function copyTemplate(dir, o, { templateDir = TEMPLATE_DIR, date } = {}) {
  if (existsSync(dir) && (!statSync(dir).isDirectory() || readdirSync(dir).length > 0)) throw new Error(`${dir} already exists and isn't empty`);
  mkdirSync(dir, { recursive: true });
  cpSync(templateDir, dir, { recursive: true, filter: (src) => !['node_modules', 'dist'].includes(basename(src)) });
  for (const e of readdirSync(dir)) if (e.startsWith('_')) renameSync(join(dir, e), join(dir, `.${e.slice(1)}`));
  for (const c of CONDITIONAL) if (!c.when(o)) rmSync(join(dir, c.file), { force: true });
  const values = placeholders(o, date);
  const files = walk(dir);
  for (const f of files) {
    const path = join(dir, f);
    const text = readFileSync(path, 'utf8');
    const filled = fill(text, values);
    if (filled !== text) writeFileSync(path, filled);
  }
  return files;
}

// Who the new project's Engineers are, or an error when the signed-in account isn't one.
export function resolveEngineers({ cwd, given = [], getLogin = ghLogin }) {
  const login = getLogin(cwd);
  if (!login) throw new Error('only the Engineer creates a project (G-0024), and gh is not signed in: run gh auth login');
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const listed = readEngineers(cwd);
  if (listed.length) {
    if (!listed.some((l) => same(l, login)))
      throw new Error(`only the Engineer creates a project (G-0024): ${login} is not in this project's .harness/engineers`);
    return { login, engineers: unique([...listed, ...given]) };
  }
  if (given.length === 0)
    throw new Error('only the Engineer creates a project (G-0024): run this inside a project where you are an Engineer, or name the new project\'s Engineers with --engineer <login>');
  if (!given.some((g) => same(g, login)))
    throw new Error(`only the Engineer creates a project (G-0024): ${login} is not among --engineer ${given.join(', ')}`);
  return { login, engineers: unique(given) };
}

// The project rules create adds to the AGENTS.md that `harness init` wrote.
export const PROJECT_RULES = `- **Every change to data goes through \`src/db/write.ts\`** (D-0002). Screens never write to
  a table directly: the change would not sync.
- **No internal id in an address or on screen** (D-0005): slugs only.
- **Every word a user reads lives in \`src/text.ts\`** (D-0004).
- **Tokens only** (D-0003): no colour, radius or font written out in a component, and every
  component is shown on \`/design\`.
- **Demo data for every screen** (G-0019), in \`src/seed/demo.ts\`.
- **The checks:** \`pnpm run typecheck\`, \`pnpm test\`, \`pnpm run build\`, \`pnpm run test:e2e\`
  and \`pnpm run check\`.
`;

// The replacement is a function: as a string, `$&` or `$'` in the title or purpose would be
// read as patterns.
export function describeInAgents(text, o) {
  const described = text.replace(/^<One or two sentences[^>]*>$/m, () => `**${o.title}.** ${o.purpose}`);
  return `${described.replace(/\n*$/, '\n')}\n${PROJECT_RULES}`;
}

const quote = (a) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${a.replaceAll('"', '\\"')}"`);

// Runs a command and returns its output; throws with the output when it fails. pnpm goes
// through a shell, because it is a script on some platforms.
function run(command, args, { cwd, shell = false, env, timeout } = {}) {
  const r = shell
    ? spawnSync([command, ...args].map(quote).join(' '), { cwd, shell: true, encoding: 'utf8', env, timeout })
    : spawnSync(command, args, { cwd, encoding: 'utf8', env, timeout });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed${r.error ? ` (${r.error.message})` : ''}:\n${out.trim()}`);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Waits for the first CI run on the default branch and returns its conclusion.
export async function waitForCi(repo, { gh, wait = sleep, appearTries = 30, finishTries = 180, every = 10000 } = {}) {
  // gh fails while GitHub hasn't registered the workflow yet; that is "no run yet" too.
  const latest = () => {
    try {
      return JSON.parse(gh(['run', 'list', '--repo', repo, '--workflow', 'ci.yml', '--branch', 'main', '--limit', '1', '--json', 'databaseId,status,conclusion,url']))[0];
    } catch {
      return undefined;
    }
  };
  let runInfo;
  for (let i = 0; i < appearTries && !(runInfo = latest()); i++) await wait(every);
  if (!runInfo) throw new Error(`no CI run appeared on ${repo}; check its Actions tab, then run: harness protect "${REQUIRED_CHECK}"`);
  for (let i = 0; i < finishTries && runInfo.status !== 'completed'; i++) {
    await wait(every);
    runInfo = latest() ?? runInfo;
  }
  if (runInfo.status !== 'completed') throw new Error(`the first CI run is still going after a long wait: ${runInfo.url}`);
  return runInfo;
}

// What would stop the GitHub steps, found before anything is written. A repository of that
// name may exist only when it is empty (a run that got no further than creating it) and has
// the visibility asked for. And the push must be able to carry workflow files: gh's token
// needs the `workflow` scope, unless git is set up to push to GitHub another way.
export function checkGitHub(repo, visibility, { gh, git }) {
  let found;
  try {
    found = JSON.parse(gh(['repo', 'view', repo, '--json', 'isEmpty,visibility']));
  } catch {
    found = undefined;
  }
  if (found && !found.isEmpty) throw new Error(`${repo} already exists on GitHub`);
  if (found && String(found.visibility).toLowerCase() !== visibility)
    throw new Error(`${repo} exists (empty) and is ${String(found.visibility).toLowerCase()}, not ${visibility}`);
  let rewritten = false;
  try {
    rewritten = /\shttps:\/\/github\.com/i.test(git(['config', '--get-regexp', '^url\\..*\\.insteadof$']));
  } catch {
    // No such rule.
  }
  if (!rewritten) {
    let headers = '';
    try {
      headers = gh(['api', '-i', 'user']);
    } catch {
      // Not a token whose scopes can be read; the push will tell.
    }
    const scopes = headers.match(/^x-oauth-scopes:(.*)$/im)?.[1];
    if (scopes !== undefined && !scopes.split(',').some((s) => s.trim() === 'workflow'))
      throw new Error("gh's token may not push workflow files: run gh auth refresh -s workflow, then run this again");
  }
  return { exists: Boolean(found) };
}

// Creates the project. `o` comes from resolveOptions; `deps` are injectable for tests.
export async function create(o, { cwd = process.cwd(), getLogin = ghLogin, log = console.log, exec = run, wait = sleep } = {}) {
  const { login, engineers } = resolveEngineers({ cwd, given: o.engineers, getLogin });
  const repo = `${login}/${o.name}`;
  const gh = (args, opts) => exec('gh', args, opts);
  const git = (args) => exec('git', args, { cwd: o.dir });
  const pnpm = (args) => exec('pnpm', args, { cwd: o.dir, shell: true });
  const harness = (args) => exec(process.execPath, [join(o.dir, INSTALLED_PATH, 'bin', 'harness.mjs'), ...args], { cwd: o.dir });

  const reuse = o.github && checkGitHub(repo, o.visibility, { gh, git: (args) => exec('git', args, { cwd }) }).exists;

  log(`Creating ${o.title} in ${o.dir}`);
  const existed = existsSync(o.dir);
  const files = copyTemplate(o.dir, o);
  log(`✓ the app, from the template: ${files.length} files`);
  // Until the first commit a failure leaves nothing behind: what this run put in the folder
  // is removed, so the same command can be run again.
  try {
    exec(process.execPath, ['scripts/make-icons.mjs'], { cwd: o.dir });
    git(['init', '-q', '-b', 'main']);
    // The identity for this repository only, when given; otherwise git's own configuration.
    if (o.gitName) git(['config', 'user.name', o.gitName]);
    if (o.gitEmail) git(['config', 'user.email', o.gitEmail]);

    pnpm(['add', '-D', o.harnessPackage]);
    log(`✓ installed the dependencies, and the harness from ${o.harnessPackage}`);
    harness(['init', ...engineers]);
    harness(['sync']);
    const agents = join(o.dir, 'AGENTS.md');
    writeFileSync(agents, describeInAgents(readFileSync(agents, 'utf8').replace(/\r\n/g, '\n'), o));
    harness(['tasks-index']);
    log(`✓ harness initialised: Engineers ${engineers.join(', ')}; 5 decisions and the first tasks recorded`);
    log(harness(['check']).trim());

    git(['add', '-A']);
    git(['commit', '-q', '-m', `Create ${o.title} from the harness template`]);
  } catch (e) {
    let cleaned = true;
    try {
      if (existed) for (const entry of readdirSync(o.dir)) rmSync(join(o.dir, entry), { recursive: true, force: true, maxRetries: 3 });
      else rmSync(o.dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      cleaned = false;
    }
    const next = cleaned
      ? `Nothing was created: ${o.dir} is ${existed ? 'empty again' : 'removed'}. Fix the cause and run the command again.`
      : `Remove ${o.dir} yourself before running the command again.`;
    throw new Error(`${e.message}\n${next}`);
  }
  log('✓ first commit on main');
  if (!o.github) {
    log(`Stopped before GitHub (--no-github). The project is in ${o.dir}`);
    return { dir: o.dir, engineers };
  }

  if (!reuse) gh(['repo', 'create', repo, `--${o.visibility}`, '--description', o.purpose]);
  const url = `https://github.com/${repo}`;
  git(['remote', 'add', 'origin', `${url}.git`]);
  // The one push to the default branch there ever is: the first commit of a new, empty
  // repository, before a ruleset can exist (G-0025). The project's pre-push hook refuses
  // every push to main, so this push runs with git's default hooks folder instead.
  // Credentials come from gh, so the push is made as the account that created the repository.
  try {
    git(['-c', 'core.hooksPath=.git/hooks', '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '-q', '-u', 'origin', 'main']);
  } catch (e) {
    throw new Error(`${e.message}\n${url} exists and is still empty. Fix the cause, remove ${o.dir}, and run the command again: it uses an empty repository of that name.`);
  }
  log(`✓ ${reuse ? 'used the empty' : 'created'} ${url} (${o.visibility}) and pushed`);

  log('Waiting for the first CI run…');
  const ci = await waitForCi(repo, { gh, wait });
  if (ci.conclusion !== 'success')
    throw new Error(`the first CI run ended as ${ci.conclusion}: ${ci.url}\nFix it through a pull request, then run: pnpm exec harness protect "${REQUIRED_CHECK}"`);
  log(`✓ CI is green: ${ci.url}`);
  // GitHub refuses rulesets on some repositories (a private one on a free plan). Everything
  // else is done by now, so say what remains instead of failing the whole run.
  let isProtected = true;
  try {
    log(harness(['protect', REQUIRED_CHECK, '--repo', repo]).trim());
  } catch (e) {
    isProtected = false;
    log(`! Remaining: the default branch is NOT protected (G-0025). GitHub refused the ruleset:\n  ${e.message.split('\n').slice(1).join('\n  ').trim()}\n  When that is solved, run in the project: pnpm exec harness protect "${REQUIRED_CHECK}"`);
  }
  log(`\n${isProtected ? 'Done.' : 'Created, but not protected.'} ${url}\nNext: open ${o.dir} and start with docs/tasks/index.md.`);
  return { dir: o.dir, engineers, repo, url, protected: isProtected };
}

// Asks for what wasn't given. Only in a terminal; elsewhere the flags are all there is.
async function ask(o, { input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, output });
  try {
    const q = async (question, fallback) => (await rl.question(fallback ? `${question} [${fallback}] ` : `${question} `)).trim() || fallback;
    o.purpose ??= await q('What is the project for? (one sentence)');
    o.accent ??= await q('Accent colour, as #rrggbb?', DEFAULTS.accent);
    o.font ??= await q(`Font (${Object.keys(FONTS).join(', ')})?`, DEFAULTS.font);
    o.language ??= await q('Interface language, as a code like en or nl?', DEFAULTS.language);
  } finally {
    rl.close();
  }
  return o;
}

export async function main(args, cwd = process.cwd(), deps = {}) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }
  try {
    const parsed = parseArgs(args);
    // Refuse a Requester before asking anything.
    resolveEngineers({ cwd, given: parsed.engineers, getLogin: deps.getLogin });
    const interactive = deps.interactive ?? (process.stdin.isTTY && process.stdout.isTTY);
    if (parsed.name && interactive) await ask(parsed);
    await create(resolveOptions(parsed, { cwd }), { cwd, ...deps });
    return 0;
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 1;
  }
}
