---
id: G-0029
title: "New repositories start private; agents create and maintain the default branch's ruleset wherever GitHub allows one"
description: "A new repository is private by default; agents set up and keep the branch ruleset with harness protect (pull request required with 0 approvals, the CI check required, no deletion, no force-push, no bypass actors) wherever GitHub allows one, which on a free plan means from the moment the repository is public."
status: Accepted            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.4.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: [G-0025]
replaced_by: []
tags: [process]
---

# Context

A pre-push hook and Claude Code deny rules (G-0011) only stop pushes to the default branch
from a machine that has them. Anything else with write access can still push, force-push or
delete the branch, and a pull request can be merged by hand while its checks are red.
GitHub can refuse all of that on the server with a ruleset, and G-0025 made agents
responsible for it in every repository.

The first spin-up showed that GitHub refuses rulesets on a private repository on a free
plan. So a new repository can be private or protected on the server, not both, unless the
plan is paid for. Making a repository public can't be taken back, and a plan costs money;
neither is an agent's to choose (G-0009).

# Decision

- **A new repository is private by default.** It becomes public only when the Engineer says
  so.
- **Agents create and maintain the ruleset on the default branch wherever GitHub allows
  one.** It can be reversed (a ruleset is changed or removed as easily as it is made), so it
  needs no human (G-0009).
- **A private repository on a free plan has no ruleset.** Until it is public, the pre-push
  hook, the deny rules and the draft gate (G-0008, G-0011) are what protect its default
  branch. `harness create` says so in plain words when it finishes.
- **When a repository becomes public, `harness protect` is run on it,** in the same session.
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

Private by default is the choice that can still be changed later; public is not. The
server-side rule closes what the local guard can't, and makes "green pull requests merge"
true for every way of merging, so it is added the moment it is possible. Zero approvals
keeps the tester's draft gate (G-0008) as the review, with no human click needed.

# Consequences

- While a repository is private on a free plan, nothing on the server stops a direct push to
  its default branch by someone with write access; the rules still forbid it.
- The required check's name must match what CI reports; when a CI job is renamed, the
  same pull request's author runs `harness protect` again after it merges.
- The very first commit of a new repository is pushed before a ruleset can exist.
- Under a ruleset nobody can push a fix straight to the default branch, not even in an
  emergency; the ruleset would have to be changed first, which is visible.
- The command needs `gh` signed in with admin rights on the repository.

# Guidance for agents

- Never make a repository public yourself, and never suggest it to get a ruleset; it is the
  Engineer's decision.
- A missing ruleset on a private repository is not a defect to fix: say it once, as a
  remaining item, and go on.
- When the Engineer makes a repository public, run `harness protect` at once, naming the
  check exactly as GitHub shows it (for the reusable CI workflow called from a job named
  `checks`: `checks / checks`).
- Never add a bypass actor, lower the rules or delete the ruleset to get a change in; fix
  the change.
- Check the result with `gh api repos/{owner}/{repo}/rules/branches/<default branch>`.
