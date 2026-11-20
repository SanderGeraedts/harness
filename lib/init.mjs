// harness init [login...] [--default-branch <name>]: sets an existing repository up to
// work with the harness, then runs sync. Never overwrites what the project already has.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { read } from './frontmatter.mjs';
import { HARNESS_ROOT, isHarnessRepo } from './paths.mjs';
import { ENGINEERS_FILE } from './role.mjs';
import { DEFAULT_BRANCH_FILE, sync } from './sync.mjs';
import { writeIndex } from './tasks-index.mjs';

const PREINSTALL =
  "node -e \"if(!/^pnpm\\//.test(process.env.npm_config_user_agent||'')){console.error('Use pnpm (G-0016): pnpm install');process.exit(1)}\"";

export function init(projectDir, { logins = [], branch } = {}) {
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
    writeFileSync(join(projectDir, DEFAULT_BRANCH_FILE), `${branch}\n`);
    done.push(`wrote ${DEFAULT_BRANCH_FILE}`);
  }

  create('docs/decisions/index.md', template('decisions-index.md'));
  create('docs/lessons.md', template('lessons.md'));
  create('AGENTS.md', template('AGENTS.md'));
  create('CLAUDE.md', template('CLAUDE.md'));
  create('.nvmrc', `${process.versions.node.split('.')[0]}\n`);
  mkdirSync(join(projectDir, 'docs/tasks'), { recursive: true });

  // The hook is a shell script: keep its line endings as they are on every platform.
  const attributes = '.githooks/* text eol=lf';
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

  done.push(...sync(projectDir).map((p) => `wrote ${p}`));
  writeIndex(join(projectDir, 'docs/tasks'));
  done.push('wrote docs/tasks/index.md');

  // Record the hook as executable, so it also runs on a fresh clone elsewhere.
  if (existsSync(join(projectDir, '.git'))) {
    try {
      execFileSync('git', ['add', '--chmod=+x', '--', '.githooks/pre-push'], { cwd: projectDir, stdio: 'ignore' });
    } catch {
      done.push('! could not mark .githooks/pre-push executable in git: run git add --chmod=+x .githooks/pre-push');
    }
  }
  return done;
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
  const at = args.indexOf('--default-branch');
  const branch = at >= 0 ? args[at + 1] : undefined;
  if (at >= 0 && !branch) {
    console.error('✗ --default-branch needs a name');
    return 1;
  }
  const logins = args.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));
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
