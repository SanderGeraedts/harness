// The workflows can't run here, so these tests hold on to what callers rely on: the inputs
// and their defaults, the triggers, and that the README's examples match them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { HARNESS_ROOT, harnessVersion } from '../lib/paths.mjs';

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
    assert.deepEqual(Object.keys(found), ['node-version-file', 'harness', 'checks', 'e2e', 'artifacts', 'artifact-name', 'artifacts-only-on-failure']);
    assert.deepEqual(found.artifacts, { type: 'string', default: '' });
    assert.deepEqual(found['artifact-name'], { type: 'string', default: 'ci-artifacts' });
    assert.deepEqual(found['artifacts-only-on-failure'], { type: 'boolean', default: 'false' });
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
    assert.deepEqual(Object.keys(found), ['ci-workflow', 'backend-workflow', 'backend-paths', 'hold-paths', 'hold-label']);
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
