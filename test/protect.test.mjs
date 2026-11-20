import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GITHUB_ACTIONS_INTEGRATION_ID, RULESET_NAME, applyRuleset, buildRuleset, main } from '../lib/protect.mjs';

describe('protect', () => {
  it('builds the ruleset: pull request with 0 approvals, required checks, no deletion, no force-push, no bypass', () => {
    assert.deepEqual(buildRuleset(['checks / checks', ' e2e ', 'checks / checks']), {
      name: RULESET_NAME,
      target: 'branch',
      enforcement: 'active',
      bypass_actors: [],
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        {
          type: 'pull_request',
          parameters: {
            required_approving_review_count: 0,
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: false,
            require_last_push_approval: false,
            required_review_thread_resolution: false,
          },
        },
        {
          type: 'required_status_checks',
          parameters: {
            strict_required_status_checks_policy: false,
            required_status_checks: [
              { context: 'checks / checks', integration_id: 15368 },
              { context: 'e2e', integration_id: 15368 },
            ],
          },
        },
      ],
    });
    assert.equal(GITHUB_ACTIONS_INTEGRATION_ID, 15368);
  });

  it('needs at least one check', () => {
    assert.throws(() => buildRuleset([]), /at least one required check/);
    assert.throws(() => buildRuleset(['  ']), /at least one required check/);
    assert.equal(main([]), 1);
    assert.equal(main(['--dry-run']), 1);
    assert.equal(main(['checks / checks', '--dry-run']), 0);
  });

  it('creates the ruleset when there is none with its name', () => {
    const calls = [];
    const run = (args, opts) => {
      calls.push({ args, body: opts?.input && JSON.parse(opts.input) });
      return args.includes('POST') ? '{"id": 12}' : '[{"id": 3, "name": "something else"}]';
    };
    assert.deepEqual(applyRuleset('owner/name', buildRuleset(['ci']), run), { action: 'created', id: 12 });
    assert.deepEqual(calls[0].args, ['api', '--paginate', 'repos/owner/name/rulesets?includes_parents=false']);
    assert.deepEqual(calls[1].args, ['api', '-X', 'POST', 'repos/owner/name/rulesets', '--input', '-']);
    assert.deepEqual(calls[1].body, buildRuleset(['ci']));
  });

  it('updates the ruleset with the same name instead of adding a second one', () => {
    const calls = [];
    const run = (args, opts) => {
      calls.push({ args, body: opts?.input && JSON.parse(opts.input) });
      return args.includes('PUT') ? '{"id": 7}' : `[{"id": 3, "name": "other"}, {"id": 7, "name": ${JSON.stringify(RULESET_NAME)}}]`;
    };
    assert.deepEqual(applyRuleset('owner/name', buildRuleset(['ci', 'e2e']), run), { action: 'updated', id: 7 });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].args, ['api', '-X', 'PUT', 'repos/owner/name/rulesets/7', '--input', '-']);
    assert.deepEqual(calls[1].body.rules[3].parameters.required_status_checks.map((c) => c.context), ['ci', 'e2e']);
  });
});
