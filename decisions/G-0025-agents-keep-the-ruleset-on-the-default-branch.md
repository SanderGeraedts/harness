---
id: G-0025
title: "Agents create and maintain the ruleset on a repository's default branch"
description: "Agents set up and keep the branch ruleset with harness protect: changes need a pull request with 0 approvals, the CI check is required, no deletion, no force-push and no bypass actors; it can be reversed, so it needs no human."
status: Replaced            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.1.0                # the harness version that added this record
changed: 0.4.0              # the version in which it was replaced or redacted
replaces: []
replaced_by: [G-0029]
tags: [process]
---

# Context

A pre-push hook and Claude Code deny rules (G-0011) only stop pushes to the default branch
from a machine that has them. Anything else with write access can still push, force-push or
delete the branch, and a pull request can be merged by hand while its checks are red.
GitHub can refuse all of that on the server, but someone has to set it up in every
repository and keep it in step when the CI check's name changes.

# Decision

- **Agents create and maintain the ruleset on a repository's default branch.** It can be
  reversed (a ruleset is changed or removed as easily as it is made), so it needs no human
  (G-0009).
- **The ruleset:**
  - changes need a pull request, with 0 approvals;
  - the CI status check is required, as reported by GitHub Actions;
  - no deletion and no force-push;
  - no bypass actors: it holds for everyone, agents and the Engineer included.
- **`harness protect <check>...` creates or updates it** through `gh api`
  (`repos/{owner}/{repo}/rulesets`). It finds the ruleset by its name, so running it again
  updates the same one.
- The auto-merge workflow still merges: a merge through the API, of a pull request whose
  required checks passed, satisfies the ruleset.

# Rationale

The server-side rule closes what the local guard can't, and makes "green pull requests
merge" true for every way of merging. Zero approvals keeps the tester's draft gate (G-0008)
as the review, with no human click needed. Leaving it to agents means a new repository is
protected from its first day instead of when someone remembers.

# Consequences

- The required check's name must match what CI reports; when a CI job is renamed, the
  same pull request's author runs `harness protect` again after it merges.
- The very first commit of a new repository is pushed before the ruleset exists.
- Nobody can push a fix straight to the default branch, not even in an emergency; the
  ruleset would have to be changed first, which is visible.
- The command needs `gh` signed in with admin rights on the repository.

# Guidance for agents

- Protect a repository as soon as its CI has run once, and name the check exactly as
  GitHub shows it (for the reusable CI workflow called from a job named `checks`:
  `checks / checks`).
- Never add a bypass actor, lower the rules or delete the ruleset to get a change in; fix
  the change.
- Check the result with `gh api repos/{owner}/{repo}/rules/branches/<default branch>`.
