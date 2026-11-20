import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  DEFAULTS,
  FONTS,
  REQUIRED_CHECK,
  TEMPLATE_DIR,
  copyTemplate,
  create,
  describeInAgents,
  fill,
  main,
  onAccent,
  parseArgs,
  placeholders,
  resolveEngineers,
  resolveOptions,
  titleFromName,
  unfilled,
  waitForCi,
} from '../lib/create.mjs';
import { read } from '../lib/frontmatter.mjs';
import { HARNESS_ROOT } from '../lib/paths.mjs';
import { cleanUp, tempDir, write } from './helpers.mjs';

after(cleanUp);

const options = (extra = {}) => resolveOptions({ name: 'my-project', purpose: 'Keep a list.', engineers: [], visibility: 'private', github: true, ...extra }, { cwd: tempDir(), version: '1.2.3' });
const walk = (dir, rel = '') =>
  readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(dir, `${rel}${e.name}/`) : [`${rel}${e.name}`]));

describe('create: options', () => {
  it('parses the name, values, repeated engineers and switches', () => {
    const o = parseArgs(['my-project', '--purpose', 'Keep a list.', '--accent=#AA3366', '--engineer', 'one', '--engineer', '@two,three', '--public', '--no-github', '--harness-ref', 'abc123', '--dir', 'x']);
    assert.deepEqual(o, {
      engineers: ['one', 'two', 'three'],
      visibility: 'public',
      github: false,
      purpose: 'Keep a list.',
      accent: '#AA3366',
      harnessRef: 'abc123',
      dir: 'x',
      name: 'my-project',
    });
    assert.deepEqual(parseArgs(['a']), { engineers: [], visibility: 'private', github: true, name: 'a' });
  });

  it('refuses an unknown option, a missing value and a second name', () => {
    assert.throws(() => parseArgs(['a', '--colour', 'red']), /unknown option --colour/);
    assert.throws(() => parseArgs(['a', '--purpose']), /--purpose needs a value/);
    assert.throws(() => parseArgs(['a', '--purpose', '--public']), /--purpose needs a value/);
    assert.throws(() => parseArgs(['a', 'b']), /one name, not 2/);
  });

  it('fills in the defaults and pins the harness to its own version', () => {
    const o = options();
    assert.equal(o.title, 'My project');
    assert.equal(o.accent, DEFAULTS.accent);
    assert.equal(o.font, 'system');
    assert.equal(o.language, 'en');
    assert.equal(o.harnessRef, 'v1.2.3');
    assert.equal(o.harnessPackage, 'github:SanderGeraedts/harness#v1.2.3');
    assert.match(o.dir, /my-project$/);
    assert.equal(options({ harnessRef: 'abc123' }).harnessPackage, 'github:SanderGeraedts/harness#abc123');
    assert.equal(options({ accent: '#AA3366' }).accent, '#aa3366');
    assert.equal(options({ purpose: '  Keep\n a   list. ' }).purpose, 'Keep a list.');
    assert.equal(titleFromName('a-b-c'), 'A b c');
  });

  it('refuses what it cannot use', () => {
    assert.throws(() => options({ name: undefined }), /name the project/);
    for (const name of ['My-Project', 'a b', '-a', 'a-', 'a_b', '../x']) assert.throws(() => options({ name }), /isn't a project name/, name);
    assert.throws(() => options({ purpose: ' ' }), /say what the project is for/);
    assert.throws(() => options({ purpose: 'x'.repeat(301) }), /one sentence/);
    assert.throws(() => options({ accent: 'red' }), /isn't a colour/);
    assert.throws(() => options({ accent: '#abc' }), /isn't a colour/);
    assert.throws(() => options({ font: 'comic' }), /isn't a font/);
    assert.throws(() => options({ language: 'English' }), /isn't a language code/);
    assert.throws(() => options({ harnessRef: 'v1; rm' }), /isn't a tag, branch or commit/);
    assert.throws(() => options({ engineers: ['a b'] }), /isn't a GitHub login/);
  });

  it('picks readable text for the accent', () => {
    assert.equal(onAccent('#000000'), '#ffffff');
    assert.equal(onAccent('#1d3b8f'), '#ffffff');
    assert.equal(onAccent('#ffffff'), '#111111');
    assert.equal(onAccent('#ffd400'), '#111111');
  });
});

describe('create: placeholders', () => {
  it('fills the ones it knows, in one pass, and leaves the rest', () => {
    const values = placeholders(options({ title: 'Tom & "Jo" <3', purpose: 'About __ACCENT__ and \'quotes\'.' }), '2026-01-02');
    assert.equal(fill('a __PROJECT_NAME__ b __DATE__', values), 'a my-project b 2026-01-02');
    assert.equal(fill('name: __PROJECT_TITLE_JSON__,', values), 'name: "Tom & \\"Jo\\" <3",');
    assert.equal(fill('<title>__PROJECT_TITLE_HTML__</title>', values), '<title>Tom &amp; &quot;Jo&quot; &lt;3</title>');
    // A value that looks like a placeholder is not filled again.
    assert.equal(fill('__PROJECT_PURPOSE__', values), "About __ACCENT__ and 'quotes'.");
    // The app's own build-time constants look the same and must survive.
    assert.equal(fill('__DEPLOY_CONTEXT__ !== __BACKEND_URL__', values), '__DEPLOY_CONTEXT__ !== __BACKEND_URL__');
    assert.deepEqual(unfilled('__ACCENT__ __DEPLOY_CONTEXT__ __ACCENT__', values), ['__ACCENT__']);
    assert.equal(values.FONT_STACK, FONTS.system);
  });

  it('copies the template with every placeholder filled and the dot files named', () => {
    const dir = join(tempDir(), 'out');
    const o = options({ accent: '#aa3366', font: 'serif', language: 'nl', title: 'Tom & Jo' });
    const files = copyTemplate(dir, o, { date: '2026-01-02' });
    const values = placeholders(o, '2026-01-02');
    for (const f of files) assert.deepEqual(unfilled(readFileSync(join(dir, f), 'utf8'), values), [], f);
    for (const f of ['.gitignore', '.gitattributes', '.github/workflows/ci.yml', '.github/workflows/auto-merge.yml', 'package.json', 'pnpm-lock.yaml', 'src/sync/README.md'])
      assert.ok(existsSync(join(dir, f)), f);
    assert.ok(!readdirSync(dir).some((e) => e.startsWith('_')), 'no _name is left at the top');
    assert.equal(JSON.parse(read(join(dir, 'package.json'))).name, 'my-project');
    assert.match(read(join(dir, '.github/workflows/ci.yml')), /uses: SanderGeraedts\/harness\/\.github\/workflows\/ci\.yml@v1\.2\.3\n/);
    assert.match(read(join(dir, '.github/workflows/auto-merge.yml')), /auto-merge\.yml@v1\.2\.3\n/);
    assert.match(read(join(dir, 'src/styles/app.css')), /--color-accent: #aa3366;\n {2}--color-on-accent: #ffffff;/);
    assert.match(read(join(dir, 'src/styles/app.css')), /--font-sans: Georgia/);
    assert.match(read(join(dir, 'index.html')), /<html lang="nl">[\s\S]*<title>Tom &amp; Jo<\/title>/);
    assert.match(read(join(dir, 'src/text.ts')), /appTitle: "Tom & Jo" as string/);
    assert.match(read(join(dir, 'src/db/db.ts')), /openDb\(name = 'my-project'\)/);
    assert.match(read(join(dir, 'vite.config.ts')), /__DEPLOY_CONTEXT__: JSON\.stringify/);
    assert.match(read(join(dir, 'docs/decisions/D-0001-what-this-project-is-for.md')), /^date: 2026-01-02$/m);
    assert.match(read(join(dir, 'docs/decisions/D-0001-what-this-project-is-for.md')), /^> Keep a list\.$/m);
    // Another language than English gets the task to translate; English doesn't.
    assert.ok(existsSync(join(dir, 'docs/tasks/T-0003-translate-the-interface.md')));
    const english = join(tempDir(), 'out');
    copyTemplate(english, options());
    assert.ok(!existsSync(join(english, 'docs/tasks/T-0003-translate-the-interface.md')));
    assert.ok(existsSync(join(english, 'docs/tasks/T-0002-give-the-project-hosting-a-backend-and-sync.md')));
  });

  it('refuses a folder that already holds something', () => {
    const dir = tempDir();
    write(dir, 'keep.txt', 'mine');
    assert.throws(() => copyTemplate(dir, options()), /already exists and isn't empty/);
    assert.deepEqual(readdirSync(dir), ['keep.txt']);
  });

  it('describes the project in AGENTS.md and adds its rules', () => {
    const text = describeInAgents(read(join(HARNESS_ROOT, 'templates', 'AGENTS.md')), options());
    assert.match(text, /^\*\*My project\.\*\* Keep a list\.$/m);
    assert.doesNotMatch(text, /<One or two sentences/);
    assert.match(text, /## Project rules\n[\s\S]*src\/db\/write\.ts[\s\S]*\(D-0005\)/);
  });
});

describe('create: the template', () => {
  const files = walk(TEMPLATE_DIR);

  it('carries what a project needs and nothing built', () => {
    for (const f of ['package.json', 'pnpm-lock.yaml', '_gitignore', '_github/workflows/ci.yml', 'src/db/write.ts', 'src/db/slug.ts', 'src/seed/demo.ts', 'src/sync/README.md', 'e2e/items.spec.ts', 'docs/decisions/index.md'])
      assert.ok(files.includes(f), f);
    assert.ok(!files.some((f) => /(^|\/)(node_modules|dist)\//.test(f)), 'no node_modules or dist');
  });

  it('pins pnpm to the harness\'s own version, and its decision index lists its records', () => {
    const own = JSON.parse(read(join(HARNESS_ROOT, 'package.json')));
    assert.equal(JSON.parse(read(join(TEMPLATE_DIR, 'package.json'))).packageManager, own.packageManager);
    const index = read(join(TEMPLATE_DIR, 'docs/decisions/index.md'));
    for (const f of files.filter((x) => /^docs\/decisions\/D-\d{4}-/.test(x))) assert.ok(index.includes(`(${f.split('/').pop()})`), f);
  });
});

describe('create: only the Engineer', () => {
  const project = (engineers) => {
    const dir = tempDir();
    if (engineers) write(dir, '.harness/engineers', engineers.map((l) => `${l}\n`).join(''));
    return dir;
  };

  it('inside a project: the signed-in account must be listed, and the new project gets the same Engineers', () => {
    const cwd = project(['Engineer-One', 'engineer-two']);
    assert.deepEqual(resolveEngineers({ cwd, getLogin: () => 'engineer-one' }), { login: 'engineer-one', engineers: ['Engineer-One', 'engineer-two'] });
    assert.deepEqual(resolveEngineers({ cwd, given: ['engineer-ONE', 'three'], getLogin: () => 'engineer-two' }).engineers, ['Engineer-One', 'engineer-two', 'three']);
    assert.throws(() => resolveEngineers({ cwd, getLogin: () => 'someone' }), /only the Engineer creates a project \(G-0024\): someone is not in/);
    // Naming yourself doesn't help inside a project.
    assert.throws(() => resolveEngineers({ cwd, given: ['someone'], getLogin: () => 'someone' }), /someone is not in/);
  });

  it('outside a project: --engineer is required and must include the signed-in account', () => {
    const cwd = project();
    assert.deepEqual(resolveEngineers({ cwd, given: ['Engineer-One'], getLogin: () => 'engineer-one' }), { login: 'engineer-one', engineers: ['Engineer-One'] });
    assert.throws(() => resolveEngineers({ cwd, getLogin: () => 'engineer-one' }), /name the new project's Engineers with --engineer/);
    assert.throws(() => resolveEngineers({ cwd, given: ['other'], getLogin: () => 'engineer-one' }), /engineer-one is not among --engineer other/);
  });

  it('refuses when gh is not signed in', () => {
    assert.throws(() => resolveEngineers({ cwd: project(['a']), getLogin: () => undefined }), /gh is not signed in/);
  });

  it('a Requester gets a refusal and nothing is written', async () => {
    const cwd = project(['engineer-one']);
    const errors = [];
    const original = console.error;
    console.error = (m) => errors.push(m);
    try {
      assert.equal(await main(['my-project', '--purpose', 'x', '--no-github'], cwd, { getLogin: () => 'someone', interactive: false }), 1);
    } finally {
      console.error = original;
    }
    assert.match(errors.join('\n'), /only the Engineer creates a project/);
    assert.ok(!existsSync(join(cwd, 'my-project')));
  });
});

describe('create: the steps', () => {
  // Records every command instead of running it; `init` leaves the file create edits.
  const fake = (o, { repoExists = false, runs = [[], [{ status: 'in_progress', url: 'u' }], [{ status: 'completed', conclusion: 'success', url: 'u' }]] } = {}) => {
    const calls = [];
    const exec = (command, args) => {
      const line = `${command === process.execPath ? 'node' : command} ${args.join(' ')}`.replaceAll(o.dir, '<dir>').replaceAll('\\', '/');
      calls.push(line);
      if (/harness\.mjs init/.test(line)) write(o.dir, 'AGENTS.md', read(join(HARNESS_ROOT, 'templates', 'AGENTS.md')));
      if (/^gh repo view/.test(line) && !repoExists) throw new Error('not found');
      if (/^gh run list/.test(line)) return JSON.stringify(runs.length > 1 ? runs.shift() : runs[0]);
      return '';
    };
    return { calls, deps: { cwd: tempDir(), getLogin: () => 'engineer-one', log: () => {}, exec, wait: async () => {} } };
  };
  const bin = 'node <dir>/node_modules/@sandergeraedts/harness/bin/harness.mjs';

  it('with --no-github: template, install, init, sync, index, check, commit, and no more', async () => {
    const o = { ...options({ engineers: ['engineer-one'], github: false }), dir: join(tempDir(), 'p') };
    const { calls, deps } = fake(o);
    const result = await create(o, deps);
    assert.deepEqual(calls, [
      'node scripts/make-icons.mjs',
      'git init -q -b main',
      'pnpm add -D github:SanderGeraedts/harness#v1.2.3',
      `${bin} init engineer-one`,
      `${bin} sync`,
      `${bin} tasks-index`,
      `${bin} check`,
      'git add -A',
      'git commit -q -m Create My project from the harness template',
    ]);
    assert.deepEqual(result, { dir: o.dir, engineers: ['engineer-one'] });
    assert.match(read(join(o.dir, 'AGENTS.md')), /^\*\*My project\.\*\* Keep a list\.$/m);
  });

  it('with GitHub: a private repository, the first push, the wait for CI, then the ruleset', async () => {
    const o = { ...options({ engineers: ['engineer-one'] }), dir: join(tempDir(), 'p') };
    const { calls, deps } = fake(o);
    const result = await create(o, deps);
    assert.equal(calls[0], 'gh repo view engineer-one/my-project --json name');
    const after = calls.slice(calls.indexOf('git commit -q -m Create My project from the harness template') + 1);
    assert.equal(after[0], 'gh repo create engineer-one/my-project --private --description Keep a list.');
    assert.equal(after[1], 'git remote add origin https://github.com/engineer-one/my-project.git');
    assert.match(after[2], /^git -c core\.hooksPath=\.git\/hooks .* push -q -u origin main$/);
    assert.equal(after.filter((c) => c.startsWith('gh run list --repo engineer-one/my-project')).length, 3);
    assert.equal(after.at(-1), `${bin} protect ${REQUIRED_CHECK} --repo engineer-one/my-project`);
    assert.equal(result.url, 'https://github.com/engineer-one/my-project');
  });

  it('stops before writing anything when the repository exists', async () => {
    const o = { ...options({ engineers: ['engineer-one'] }), dir: join(tempDir(), 'p') };
    const { calls, deps } = fake(o, { repoExists: true });
    await assert.rejects(create(o, deps), /engineer-one\/my-project already exists on GitHub/);
    assert.equal(calls.length, 1);
    assert.ok(!existsSync(o.dir));
  });

  it('does not protect the branch when the first CI run fails', async () => {
    const o = { ...options({ engineers: ['engineer-one'] }), dir: join(tempDir(), 'p') };
    const { calls, deps } = fake(o, { runs: [[{ status: 'completed', conclusion: 'failure', url: 'the-run' }]] });
    await assert.rejects(create(o, deps), /the first CI run ended as failure: the-run/);
    assert.ok(!calls.some((c) => c.includes(' protect ')));
  });

  it('waitForCi gives up when no run appears', async () => {
    await assert.rejects(waitForCi('a/b', { gh: () => '[]', wait: async () => {}, appearTries: 3 }), /no CI run appeared on a\/b/);
  });
});
