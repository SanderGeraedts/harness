// harness init [login...] [--default-branch <name>]: sets an existing repository up to
// work with the harness, then runs sync. Never overwrites what the project already has,
// except the files the harness generates. `harness adopt --write` runs it with
// `overwrite: false`, which leaves those alone as well when they exist.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { read } from './frontmatter.mjs';
import { HARNESS_ROOT, INSTALLED_PATH, isHarnessRepo } from './paths.mjs';
import { ENGINEERS_FILE } from './role.mjs';
import { DEFAULT_BRANCH_FILE, sync } from './sync.mjs';
import { writeIndex } from './tasks-index.mjs';

const PREINSTALL =
  "node -e \"if(!/^pnpm\\//.test(process.env.npm_config_user_agent||'')){console.error('Use pnpm (G-0016): pnpm install');process.exit(1)}\"";

// The project's own files that init creates when they are missing, each with what there is
// to do by hand when the project already has one.
export const INIT_FILES = {
  [ENGINEERS_FILE]: 'the logins you pass are added to it',
  'docs/decisions/index.md': 'kept; harness check wants every record listed in it',
  'docs/lessons.md': undefined,
  'AGENTS.md': `add the pointers from ${INSTALLED_PATH}/templates/AGENTS.md by hand`,
  'CLAUDE.md': `add the line from ${INSTALLED_PATH}/templates/CLAUDE.md by hand`,
  '.nvmrc': undefined,
};
// The hook is a shell script: keep its line endings as they are on every platform.
export const ATTRIBUTES_RULE = '.githooks/* text eol=lf';

export function init(projectDir, { logins = [], branch, overwrite = true } = {}) {
  const done = [];
  const create = (rel, content) => {
    const path = join(projectDir, rel);
    if (existsSync(path)) return false;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    done.push(`created ${rel}`);
    return true;
  };
  const template = (name) => read(join(HARNESS_ROOT, 'templates', name));

  // Who the Engineers are. New logins are added; nobody is removed.
  const engineersPath = join(projectDir, ENGINEERS_FILE);
  const clean = logins.map((l) => l.replace(/^@/, ''));
  if (!create(ENGINEERS_FILE, `# GitHub logins of this project's Engineers, one per line (G-0007).\n${clean.map((l) => `${l}\n`).join('')}`)) {
    const have = read(engineersPath);
    const known = have.split('\n').map((l) => l.replace(/#.*$/, '').trim().toLowerCase());
    const add = clean.filter((l) => !known.includes(l.toLowerCase()));
    if (add.length) {
      writeFileSync(engineersPath, `${have.replace(/\n*$/, '\n')}${add.map((l) => `${l}\n`).join('')}`);
      done.push(`added ${add.join(', ')} to ${ENGINEERS_FILE}`);
    }
  }
  if (branch) {
    const branchPath = join(projectDir, DEFAULT_BRANCH_FILE);
    if (overwrite || !existsSync(branchPath)) {
      writeFileSync(branchPath, `${branch}\n`);
      done.push(`wrote ${DEFAULT_BRANCH_FILE}`);
    } else if (read(branchPath).trim() !== branch) done.push(`! kept ${DEFAULT_BRANCH_FILE}, which names ${read(branchPath).trim()}, not ${branch}`);
  }

  create('docs/decisions/index.md', template('decisions-index.md'));
  create('docs/lessons.md', template('lessons.md'));
  create('AGENTS.md', template('AGENTS.md'));
  create('CLAUDE.md', template('CLAUDE.md'));
  create('.nvmrc', `${process.versions.node.split('.')[0]}\n`);
  mkdirSync(join(projectDir, 'docs/tasks'), { recursive: true });

  const attributes = ATTRIBUTES_RULE;
  const attrPath = join(projectDir, '.gitattributes');
  const haveAttr = existsSync(attrPath) ? read(attrPath) : '';
  if (!haveAttr.split('\n').includes(attributes)) {
    writeFileSync(attrPath, `${haveAttr && !haveAttr.endsWith('\n') ? `${haveAttr}\n` : haveAttr}${attributes}\n`);
    done.push('added the hook rule to .gitattributes');
  }

  // package.json: pnpm only, and git hooks switched on after every install.
  const pkgPath = join(projectDir, 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  pkg.scripts ??= {};
  const before = JSON.stringify(pkg);
  pkg.scripts.preinstall ??= PREINSTALL;
  pkg.scripts.prepare ??= 'harness hooks';
  if (JSON.stringify(pkg) !== before) {
    const indent = raw.match(/^(\s+)"/m)?.[1] ?? '  ';
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, indent)}\n`);
    done.push('added the preinstall and prepare scripts to package.json');
  }

  const written = sync(projectDir, { onlyMissing: !overwrite });
  done.push(...written.map((p) => `wrote ${p}`));
  if (overwrite || !existsSync(join(projectDir, 'docs/tasks/index.md'))) {
    writeIndex(join(projectDir, 'docs/tasks'));
    done.push('wrote docs/tasks/index.md');
  }

  // Record the hook as executable, so it also runs on a fresh clone elsewhere.
  if (existsSync(join(projectDir, '.git')) && (overwrite || written.includes('.githooks/pre-push'))) {
    try {
      execFileSync('git', ['add', '--chmod=+x', '--', '.githooks/pre-push'], { cwd: projectDir, stdio: 'ignore' });
    } catch {
      done.push('! could not mark .githooks/pre-push executable in git: run git add --chmod=+x .githooks/pre-push');
    }
  }
  return done;
}

// { logins, branch } from "[login...] [--default-branch <name>]", or { error }.
export function parseArgs(args) {
  const at = args.indexOf('--default-branch');
  const branch = at >= 0 ? args[at + 1] : undefined;
  if (at >= 0 && (!branch || branch.startsWith('--'))) return { error: '--default-branch needs a name' };
  const unknown = args.find((a, i) => a.startsWith('--') && i !== at);
  if (unknown) return { error: `unknown option ${unknown}` };
  return { logins: args.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1)), branch };
}

export function main(args, cwd = process.cwd()) {
  if (!existsSync(join(cwd, 'package.json'))) {
    console.error('✗ no package.json here: run harness init in the root of a Node project');
    return 1;
  }
  if (isHarnessRepo(cwd)) {
    console.error('✗ this is the harness itself; init is for projects that install it');
    return 1;
  }
  const { logins, branch, error } = parseArgs(args);
  if (error) {
    console.error(`✗ ${error}`);
    return 1;
  }
  try {
    console.log(init(cwd, { logins, branch }).join('\n'));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 1;
  }
  if (logins.length === 0) console.log(`! no Engineer given: add GitHub logins to ${ENGINEERS_FILE}, one per line`);
  console.log('Next: describe the project in AGENTS.md, add the CI and auto-merge workflows (see the harness README), and commit.');
  return 0;
}
