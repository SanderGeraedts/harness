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

describe("the harness's own workflows", () => {
  it('its CI can be started by hand, and uses the artifact inputs', () => {
    const ci = workflow('self-ci.yml');
    assert.match(ci, /\non:\n {2}pull_request:\n.*\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/);
    assert.match(ci, /\n {6}artifact-name: self-test-project\n {6}artifacts-only-on-failure: true\n/);
    assert.match(ci, /^name: Harness CI$/m);
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
  });

  it("its caller examples give CI a workflow_dispatch trigger and auto-merge actions: write", () => {
    const blocks = [...readme.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]);
    const ci = blocks.find((b) => b.startsWith('name: CI\n'));
    const merge = blocks.find((b) => b.startsWith('name: Auto-merge\n'));
    assert.match(ci, /\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/);
    assert.match(merge, /\n {2}actions: write\n/);
  });

  it('names every input of both reusable workflows', () => {
    for (const name of [...Object.keys(inputs(workflow('ci.yml'))), ...Object.keys(inputs(workflow('auto-merge.yml')))])
      if (name !== 'harness') assert.ok(readme.includes(`\`${name}\``), `the README doesn't mention the input ${name}`);
  });
});
