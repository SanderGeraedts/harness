// harness protect <check>... [--repo owner/name] [--dry-run]: creates or updates the
// ruleset on a repository's default branch (G-0029), through `gh api`.
//
// The ruleset: changes need a pull request (0 approvals), the named CI checks must pass,
// no deletion, no force-push, and nobody bypasses it. It is found again by its name, so
// running the command twice updates the same ruleset.
import { execFileSync } from 'node:child_process';

export const RULESET_NAME = 'harness: default branch';
// The GitHub Actions app: only a check reported by Actions satisfies the rule.
export const GITHUB_ACTIONS_INTEGRATION_ID = 15368;

export function buildRuleset(checks) {
  const contexts = [...new Set(checks.map((c) => c.trim()).filter(Boolean))];
  if (contexts.length === 0) throw new Error('name at least one required check, e.g. harness protect "checks / checks"');
  return {
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
          required_status_checks: contexts.map((context) => ({ context, integration_id: GITHUB_ACTIONS_INTEGRATION_ID })),
        },
      },
    ],
  };
}

const gh = (args, { cwd, input } = {}) =>
  execFileSync('gh', args, { cwd, input, encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], timeout: 30000 });

// Creates the ruleset, or updates the one with the same name. `run` is `gh`, injectable.
export function applyRuleset(repo, ruleset, run = gh) {
  const existing = JSON.parse(run(['api', '--paginate', `repos/${repo}/rulesets?includes_parents=false`])).find(
    (r) => r.name === ruleset.name && r.source_type !== 'Organization',
  );
  const body = JSON.stringify(ruleset);
  const out = existing
    ? run(['api', '-X', 'PUT', `repos/${repo}/rulesets/${existing.id}`, '--input', '-'], { input: body })
    : run(['api', '-X', 'POST', `repos/${repo}/rulesets`, '--input', '-'], { input: body });
  return { action: existing ? 'updated' : 'created', id: JSON.parse(out).id };
}

export function main(args, cwd = process.cwd()) {
  const at = args.indexOf('--repo');
  let repo = at >= 0 ? args[at + 1] : undefined;
  const checks = args.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));
  let ruleset;
  try {
    ruleset = buildRuleset(checks);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 1;
  }
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify(ruleset, null, 2));
    return 0;
  }
  try {
    repo ??= gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { cwd }).trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`"${repo}" isn't owner/name`);
    const { action, id } = applyRuleset(repo, ruleset);
    console.log(`✓ ${action} ruleset "${RULESET_NAME}" (${id}) on ${repo}: pull request required, ${checks.length} required check${checks.length === 1 ? '' : 's'}, no deletion, no force-push, no bypass`);
    return 0;
  } catch (e) {
    console.error(`✗ ${(e.stderr || e.message || String(e)).toString().trim()}`);
    return 1;
  }
}
