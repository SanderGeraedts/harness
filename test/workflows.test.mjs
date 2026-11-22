// The workflows can't run here, so these tests hold on to what callers rely on: the inputs
// and their defaults, the triggers, and that the README's examples match them.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { HARNESS_ROOT, harnessVersion } from '../lib/paths.mjs';
import { cleanUp, tempDir } from './helpers.mjs';

after(cleanUp);

const text = (rel) => readFileSync(join(HARNESS_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const workflow = (name) => text(`.github/workflows/${name}`);

// The workflow_call inputs of a reusable workflow: { name: { type, default } }.
function inputs(yaml) {
  const block = yaml.match(/\n {2}workflow_call:\n {4}inputs:\n([\s\S]*?)\n(?=\S)/)?.[1] ?? '';
  const found = {};
  for (const part of block.split(/\n(?= {6}\S)/)) {
    const name = part.match(/^ {6}([\w-]+):/)?.[1];
    if (!name) continue;
    const def = part.match(/\n {8}default:[ ]?(.*)/)?.[1];
    found[name] = { type: part.match(/\n {8}type: (\w+)/)?.[1], default: def === '""' ? '' : def };
  }
  return found;
}

describe('the reusable CI workflow', () => {
  const ci = workflow('ci.yml');

  it('has the artifact inputs, with defaults that keep 0.1.0 callers as they were', () => {
    const found = inputs(ci);
    assert.deepEqual(Object.keys(found), ['node-version-file', 'harness', 'checks', 'e2e', 'e2e-shards', 'e2e-build', 'e2e-backend-origin', 'artifacts', 'artifact-name', 'artifacts-only-on-failure']);
    assert.deepEqual(found.artifacts, { type: 'string', default: '' });
    assert.deepEqual(found['artifact-name'], { type: 'string', default: 'ci-artifacts' });
    assert.deepEqual(found['artifacts-only-on-failure'], { type: 'boolean', default: 'false' });
  });

  it('parses as YAML, and runs the end-to-end tests in the checks job unless e2e-shards is above 1', () => {
    const doc = parseYaml(ci);
    const input = doc.on.workflow_call.inputs;
    assert.deepEqual([input['e2e-shards'].type, input['e2e-shards'].default], ['number', 1]);
    assert.equal(input['e2e-build'].default, 'pnpm run --if-present build');
    assert.deepEqual(Object.keys(doc.jobs), ['checks', 'shards', 'e2e']);
    const inChecks = doc.jobs.checks.steps.filter((s) => /browser|End-to-end/.test(s.name ?? ''));
    assert.equal(inChecks.length, 3);
    for (const s of inChecks) assert.equal(s.if, "inputs.e2e != '' && inputs.e2e-shards < 2", s.name);
    assert.equal(doc.jobs.shards.if, "inputs.e2e != '' && inputs.e2e-shards > 1");
  });

  it('with e2e-shards, runs one Playwright shard per job, each building first, none stopping the others', () => {
    const { checks, shards, e2e } = parseYaml(ci).jobs;
    assert.match(shards.steps[0].run, /seq -s, 1 "\$SHARDS"/);
    assert.equal(e2e.needs, 'shards');
    assert.equal(e2e.strategy['fail-fast'], false);
    assert.equal(e2e.strategy.matrix.shard, '${{ fromJSON(needs.shards.outputs.list) }}');
    const names = e2e.steps.map((s) => s.name ?? s.run ?? s.uses);
    assert.deepEqual(names.slice(4), ['Take the backend the shards job built', 'Start the throwaway backend', 'Build', 'Cache the browser', 'Install the browser', 'End-to-end tests', 'Stop the throwaway backend', 'Upload artifacts']);
    assert.equal(e2e.steps[2].with.cache, 'pnpm', 'pnpm is cached per shard');
    const step = (job) => job.steps.find((s) => s.name === 'End-to-end tests');
    assert.equal(step(e2e).env.SHARD, '--shard=${{ matrix.shard }}/${{ inputs.e2e-shards }} --fully-parallel', 'split by test, not by file');
    assert.equal(step(checks).env.SHARD, '');
    assert.equal(step(e2e).run, step(checks).run, 'the same script in both places');
    assert.equal(e2e.steps.find((s) => s.name === 'Upload artifacts').with.name, '${{ inputs.artifact-name }}-e2e-${{ matrix.shard }}');
  });

  it('with e2e-shards, builds the backend once and hands it to every end-to-end job, which starts it instead of building', () => {
    const { shards, e2e } = parseYaml(ci).jobs;
    const at = (job, name) => job.steps.find((s) => s.name === name);
    assert.deepEqual(shards.outputs, { list: '${{ steps.list.outputs.list }}', backend: '${{ steps.backend.outputs.built }}' });
    const build = at(shards, 'Build the backend once');
    assert.equal(build.id, 'backend');
    assert.equal(build.if, "hashFiles('backend/Dockerfile') != ''");
    assert.match(build.run, /^\$\{\{ inputs\.harness \}\} backend build "\$RUNNER_TEMP\/e2e-backend\/backend"\necho "built=true" >> "\$GITHUB_OUTPUT"\n$/);
    assert.equal(at(shards, 'Cache the backend\'s toolchain').with.path, '~/.cache/harness');
    const handed = at(shards, 'Hand the backend to the end-to-end jobs');
    assert.equal(handed.if, "steps.backend.outputs.built == 'true'");
    assert.deepEqual([handed.uses, handed.with.name, handed.with.path], ['actions/upload-artifact@v4', 'e2e-backend', '${{ runner.temp }}/e2e-backend/backend']);
    const taken = at(e2e, 'Take the backend the shards job built');
    assert.deepEqual([taken.if, taken.uses, taken.with.name, taken.with.path], ["needs.shards.outputs.backend == 'true'", 'actions/download-artifact@v4', 'e2e-backend', '${{ runner.temp }}/e2e-backend']);
    const started = at(e2e, 'Start the throwaway backend');
    assert.equal(started.if, "needs.shards.outputs.backend == 'true'");
    assert.equal(started.env.HARNESS_BACKEND_BINARY, `${handed.with.path}`);
    assert.equal(started.env.APP_ORIGIN, '${{ inputs.e2e-backend-origin }}');
    assert.match(started.run, /backend start\necho "BACKEND_TEST_URL=http:\/\/127\.0\.0\.1:8090" >> "\$GITHUB_ENV"/);
    assert.equal(started.env.BACKEND_TEST_PORT, '8090');
    assert.equal(parseYaml(ci).on.workflow_call.inputs['e2e-backend-origin'].default, 'http://localhost:4174');
    // Nothing in an end-to-end job builds an image or runs Docker.
    assert.doesNotMatch(JSON.stringify(e2e), /docker|backend build/);
    // The browser is cached per job, as in the checks job.
    assert.equal(at(e2e, 'Cache the browser').with.key, at(parseYaml(ci).jobs.checks, 'Cache the browser').with.key);
  });

  it('fails the job when a test passed only on a retry, run with bash on sample Playwright output', { skip: spawnSync('bash', ['-c', 'command -v sed']).status !== 0 && 'needs bash' }, () => {
    const script = parseYaml(ci).jobs.checks.steps.find((s) => s.name === 'End-to-end tests').run;
    const slash = (p) => p.replaceAll('\\', '/');
    const run = (output, { code = 0, shard = '', projects = '', failProject = '' } = {}) => {
      const dir = tempDir();
      writeFileSync(join(dir, 'out.txt'), output);
      writeFileSync(
        join(dir, 'playwright.mjs'),
        [
          "import { readFileSync } from 'node:fs';",
          'const args = process.argv.slice(3);',
          "if (args.includes('--list') && process.env.FAKE_PROJECTS) { console.log('> a pnpm header'); console.log(JSON.stringify({ config: { projects: process.env.FAKE_PROJECTS.split(',').map((name) => ({ name })) } })); process.exit(0); }",
          "console.log('args:', args.join(' '));",
          "process.stdout.write(readFileSync(process.argv[2], 'utf8'));",
          `process.exit(process.env.FAKE_FAIL && args.includes(process.env.FAKE_FAIL) ? 1 : ${code});`,
        ].join('\n'),
      );
      const r = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
        encoding: 'utf8',
        env: { ...process.env, E2E: `node "${slash(join(dir, 'playwright.mjs'))}" "${slash(join(dir, 'out.txt'))}"\n`, SHARD: shard, RUNNER_TEMP: slash(dir), FAKE_PROJECTS: projects, FAKE_FAIL: failProject },
      });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    };
    const passed = run('Running 3 tests using 2 workers\n  ✓  1 [phone] › e2e/a.spec.ts:3:1 › 1 flaky looking title\n\n  3 passed (2.1s)\n');
    assert.equal(passed.status, 0, passed.out);
    // The list reporter, in colour.
    const listed = run('  \u001b[33m  1 flaky\u001b[39m\n    [phone] › e2e/a.spec.ts:3:1 › a\n  \u001b[32m  2 passed\u001b[39m (3.0s)\n');
    assert.equal(listed.status, 1, listed.out);
    assert.match(listed.out, /::error::A test passed only on a retry/);
    // The github reporter: one notice, its lines escaped, the count first.
    assert.equal(run('::notice title=🎭 Playwright Run Summary::  1 flaky%0A    [phone] › a%0A  2 passed (3.0s)\n').status, 1);
    assert.equal(run('::notice title=🎭 Playwright Run Summary::  1 failed%0A  4 flaky%0A  2 passed\n').status, 1);
    assert.equal(run('::notice title=🎭 Playwright Run Summary::  5 passed (3.0s)\n').status, 0);
    // A failing run fails, flaky or not; and a shard gets its argument at the end.
    assert.equal(run('  1 failed\n', { code: 1 }).status, 1);
    assert.match(run('  2 passed\n', { shard: '--shard=2/3' }).out, /^args: --shard=2\/3$/m);
    assert.match(run('  2 passed\n').out, /^args: $/m);
    // A shard splits each Playwright project on its own, and runs every one even when one fails.
    const split = run('  2 passed\n', { shard: '--shard=2/3 --fully-parallel', projects: 'phone,production' });
    assert.equal(split.status, 0, split.out);
    assert.deepEqual(split.out.match(/^args: .*$/gm), [
      'args: --shard=2/3 --fully-parallel --pass-with-no-tests --project=phone',
      'args: --shard=2/3 --fully-parallel --pass-with-no-tests --project=production',
    ]);
    const oneFails = run('  2 passed\n', { shard: '--shard=1/2', projects: 'phone,production', failProject: '--project=phone' });
    assert.equal(oneFails.status, 1);
    assert.equal(oneFails.out.match(/^args: .*$/gm).length, 2, 'the second project ran too');
    // Without a shard nothing is listed: the run is the one it was before.
    assert.deepEqual(run('  2 passed\n', { projects: 'phone,production' }).out.match(/^args: .*$/gm), ['args: ']);
  });

  it('uploads under the given name, always or only after a failure', () => {
    const step = ci.slice(ci.indexOf('- name: Upload artifacts'));
    assert.match(step, /if: >-\n\s+always\(\) && inputs\.artifacts != '' &&\n\s+\(failure\(\) \|\| !inputs\.artifacts-only-on-failure\)\n/);
    assert.match(step, /name: \$\{\{ inputs\.artifact-name \}\}\n/);
    assert.match(step, /path: \$\{\{ inputs\.artifacts \}\}\n/);
  });
});

describe('the reusable auto-merge workflow', () => {
  const merge = workflow('auto-merge.yml');

  it('takes the CI workflow file to start, ci.yml by default, next to the earlier inputs', () => {
    const found = inputs(merge);
    assert.deepEqual(Object.keys(found), ['ci-workflow', 'backend-workflow', 'backend-paths', 'hold-paths', 'hold-label', 'wait-for']);
    assert.equal(found['wait-for'].default, '');
    assert.deepEqual(found['ci-workflow'], { type: 'string', default: 'ci.yml' });
    assert.equal(found['backend-workflow'].default, '');
    assert.equal(found['hold-label'].default, 'waits-for-engineer');
  });

  it('starts CI on the default branch after the merge, only after a merge, and never fails on it', () => {
    const at = (name) => merge.indexOf(`- name: ${name}`);
    assert.ok(at('Merge') > 0 && at('Start CI on the default branch') > at('Merge'));
    const step = merge.slice(at('Start CI on the default branch'), at('Start the backend workflow'));
    assert.match(step, /if: steps\.decide\.outputs\.action == 'merge' && inputs\.ci-workflow != ''\n/);
    assert.match(step, /CI_WORKFLOW: \$\{\{ inputs\.ci-workflow \}\}\n/);
    assert.match(step, /if gh workflow run "\$CI_WORKFLOW" --repo "\$REPO" --ref "\$DEFAULT_BRANCH"; then\n/);
    assert.match(step, /else\n\s+echo "::warning::Could not start \$CI_WORKFLOW/);
  });

  it('acts only on a CI run for a pull request, so the run it starts never loops back', () => {
    assert.match(merge, /github\.event\.workflow_run\.event == 'pull_request' &&/);
  });

  it('with wait-for: skips while a named workflow still runs for the head, or when it failed, and merges only after', () => {
    const decide = merge.slice(merge.indexOf('- name: Decide'), merge.indexOf('- name: Hold for the Engineer'));
    assert.match(decide, /WAIT_FOR: \$\{\{ inputs\.wait-for \}\}\n/);
    assert.match(decide, /actions\/runs\?head_sha=\$HEAD_SHA&event=pull_request/);
    // The checks come before the files are read and before the decision to merge.
    assert.ok(decide.indexOf('if [ -n "$WAIT_FOR" ]') < decide.indexOf('action=merge'));
    assert.match(decide, /"completed success"\) echo "\$name passed\." ;;/);
    assert.match(decide, /completed\*\)\n\s+echo "#\$PR is not merged: \$name ended/);
    assert.match(decide, /\*\)\n\s+echo "#\$PR waits for \$name, which is still running/);
    // A workflow that didn't run for the pull request is not waited for.
    assert.match(decide, /none\) echo "\$name didn't run for this pull request: not waiting for it\." ;;/);
  });

  it('the decision about which runs count works, run with bash and jq on sample runs', { skip: spawnSync('bash', ['-c', 'command -v jq']).status !== 0 && 'needs bash and jq' }, () => {
    const script = merge.slice(merge.indexOf('          if [ -n "$WAIT_FOR" ]; then'), merge.indexOf('          # A pull request stacked on another branch')).replace(/^ {10}/gm, '');
    const decide = (runs, waitFor, trigger = 'CI') => {
      const dir = tempDir();
      // gh, as --paginate --jq '.workflow_runs[]' prints them: one run per line.
      writeFileSync(join(dir, 'gh'), `#!/usr/bin/env bash\ncat <<'JSON'\n${runs.map((r) => JSON.stringify(r)).join('\n')}\nJSON\n`);
      chmodSync(join(dir, 'gh'), 0o755);
      const r = spawnSync('bash', ['-c', `set -e\nexport PATH="$FAKE_BIN:$PATH"\n${script}\necho "fell through"`], {
        encoding: 'utf8',
        env: { ...process.env, FAKE_BIN: dir.replaceAll('\\', '/'), WAIT_FOR: waitFor, TRIGGER: trigger, RUNNER_TEMP: dir.replaceAll('\\', '/'), GITHUB_OUTPUT: join(dir, 'out').replaceAll('\\', '/'), REPO: 'o/r', HEAD_SHA: 'abc', PR: '7' },
      });
      return `${r.stdout}${r.stderr}${existsSync(join(dir, 'out')) ? readFileSync(join(dir, 'out'), 'utf8') : ''}`;
    };
    const run = (name, status, conclusion, n) => ({ name, status, conclusion, run_number: n });
    assert.match(decide([run('CI', 'completed', 'success', 1)], 'CI,Backend'), /Backend didn't run for this pull request[\s\S]*fell through/);
    assert.match(decide([run('Backend', 'in_progress', null, 3)], 'CI,Backend'), /waits for Backend, which is still running[\s\S]*action=skip/);
    assert.match(decide([run('Backend', 'completed', 'failure', 3)], 'CI,Backend'), /not merged: Backend ended failure[\s\S]*action=skip/);
    // The newest run counts: a rerun that passed after a failure.
    assert.match(decide([run('Backend', 'completed', 'failure', 3), run('Backend', 'completed', 'success', 4)], 'CI, Backend'), /Backend passed\.\nfell through/);
    // Started by Backend: CI must have passed too.
    assert.match(decide([run('CI', 'in_progress', null, 9)], 'CI,Backend', 'Backend'), /waits for CI/);
    assert.doesNotMatch(decide([], ''), /action=/);
  });
});

describe('the reusable backend workflow', () => {
  const backend = workflow('backend.yml');

  it('has its inputs, and publishes by default', () => {
    const found = inputs(backend);
    assert.deepEqual(Object.keys(found), ['node-version-file', 'tests', 'publish', 'setup', 'project-directory']);
    assert.deepEqual(found.tests, { type: 'string', default: 'pnpm run test:backend' });
    assert.deepEqual(found.publish, { type: 'boolean', default: 'true' });
    assert.deepEqual(found['project-directory'], { type: 'string', default: '.' });
  });

  it('proves the image on an empty database before it publishes, and only from the default branch', () => {
    const at = (name) => backend.indexOf(`- name: ${name}`);
    const order = ['Build the image and start it on an empty database', 'Smoke test', 'Backend tests', 'Decide whether to publish', 'Publish'].map(at);
    assert.ok(order.every((i) => i > 0), 'a step is missing');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'the steps are out of order');
    assert.match(backend.slice(at('Decide whether to publish')), /if: >-\n\s+inputs\.publish && github\.event_name != 'pull_request' &&\n\s+github\.ref_name == github\.event\.repository\.default_branch\n/);
    const publish = backend.slice(backend.indexOf('\n  publish:\n'));
    assert.match(publish, /image="ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}-backend"/);
    for (const tag of [':$sha"', ':stable"']) assert.ok(publish.includes(`docker push "$image${tag}`), tag);
    // Nothing but the smoke test and the tests reads the backend's address, and it is this machine.
    assert.match(backend, /BACKEND_TEST_URL: http:\/\/127\.0\.0\.1:8090\n/);
  });

  it('only the publish job may write packages, and the job that runs for pull requests keeps no token', () => {
    const image = backend.slice(backend.indexOf('\n  image:\n'), backend.indexOf('\n  publish:\n'));
    const publish = backend.slice(backend.indexOf('\n  publish:\n'));
    assert.match(image, /\n {4}permissions:\n {6}contents: read\n {4}outputs:/);
    assert.doesNotMatch(image, /packages:|docker (login|push)|github\.token/);
    assert.match(image, /- uses: actions\/checkout@v5\n {8}with:\n {10}persist-credentials: false\n/);
    assert.match(publish, /\n {4}needs: image\n {4}if: needs\.image\.outputs\.publish == 'true'\n/);
    assert.match(publish, /\n {4}permissions:\n {6}contents: read\n {6}packages: write\n/);
    // It runs nothing of the project: no checkout, only the image that was proven.
    assert.doesNotMatch(publish, /actions\/checkout|pnpm|inputs\./);
    assert.equal(backend.slice(backend.indexOf('\njobs:\n')).match(/packages: write/g).length, 1, 'on the publish job only');
  });

  it("the template's caller grants packages: write to that one job only, and can be started by the auto-merge workflow", () => {
    const caller = text('template-sync/_github/workflows/backend.yml');
    assert.match(caller, /\n {2}workflow_dispatch:\n/);
    assert.match(caller, /\npermissions:\n {2}contents: read\n\n/);
    assert.match(caller, /\n {2}image:\n(?: {4}#.*\n)+ {4}permissions:\n {6}contents: read\n {6}packages: write\n {4}uses: /);
    assert.match(caller, /uses: SanderGeraedts\/harness\/\.github\/workflows\/backend\.yml@__HARNESS_REF__\n/);
    const merge = text('template-sync/_github/workflows/auto-merge.yml');
    // Decided again when Backend completes, and never merged while it fails (T-0008's open point).
    assert.match(merge, /\n {4}workflows: \[CI, Backend\]\n/);
    assert.match(merge, /\n {6}wait-for: CI,Backend\n/);
    const paths = new RegExp(merge.match(/backend-paths: "(.*)"/)[1].replaceAll('\\\\', '\\'));
    for (const f of ['backend/Dockerfile', 'backend/pb_hooks/slugs.pb.js', '.github/workflows/backend.yml']) assert.match(f, paths, f);
    for (const f of ['src/main.tsx', 'docs/backend/notes.md', '.github/workflows/ci.yml']) assert.doesNotMatch(f, paths, f);
  });
});

describe("the harness's own workflows", () => {
  it('its CI can be started by hand, and uses the artifact inputs', () => {
    const ci = workflow('self-ci.yml');
    assert.match(ci, /\non:\n {2}pull_request:\n.*\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/);
    assert.match(ci, /\n {6}artifact-name: self-test-project\n {6}artifacts-only-on-failure: true\n/);
    assert.match(ci, /^name: Harness CI$/m);
  });

  it("its CI proves the template's backend through the reusable backend workflow, and never publishes it", () => {
    const ci = workflow('self-ci.yml');
    const job = ci.slice(ci.indexOf('\n  template-backend:'));
    assert.match(job, /uses: \.\/\.github\/workflows\/backend\.yml\n/);
    assert.match(job, /\n {6}publish: false\n/);
    assert.match(job, /node scripts\/make-project\.mjs \S+ --sync/);
  });

  it('its auto-merge starts that CI on main, may start workflows, and holds the global registry', () => {
    const merge = workflow('self-auto-merge.yml');
    assert.match(merge, /\n {6}ci-workflow: self-ci\.yml\n/);
    assert.match(merge, /\npermissions:\n {2}contents: write\n {2}pull-requests: write\n {2}actions: write\n/);
    assert.match(merge, /hold-paths: "\^decisions\/"/);
    assert.match(merge, /workflows: \[Harness CI\]/);
  });
});

describe('the README', () => {
  const readme = text('README.md');
  const version = harnessVersion();

  it('pins the install and both caller workflows to the current version', () => {
    assert.ok(readme.includes(`pnpm add -D github:SanderGeraedts/harness#v${version}`));
    assert.ok(readme.includes(`uses: SanderGeraedts/harness/.github/workflows/ci.yml@v${version}`));
    assert.ok(readme.includes(`uses: SanderGeraedts/harness/.github/workflows/auto-merge.yml@v${version}`));
    assert.ok(readme.includes(`uses: SanderGeraedts/harness/.github/workflows/backend.yml@v${version}`));
  });

  it("its caller examples give CI a workflow_dispatch trigger and auto-merge actions: write", () => {
    const blocks = [...readme.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]);
    const ci = blocks.find((b) => b.startsWith('name: CI\n'));
    const merge = blocks.find((b) => b.startsWith('name: Auto-merge\n'));
    assert.match(ci, /\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/);
    assert.match(merge, /\n {2}actions: write\n/);
  });

  it('names every input of the reusable workflows', () => {
    for (const name of ['ci.yml', 'auto-merge.yml', 'backend.yml'].flatMap((f) => Object.keys(inputs(workflow(f)))))
      if (name !== 'harness') assert.ok(readme.includes(`\`${name}\``), `the README doesn't mention the input ${name}`);
  });
});
