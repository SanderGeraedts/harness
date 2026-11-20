---
id: T-0001
title: "Build the harness repository"
description: "The global registry, the rules, the roles, the agent team, the harness command and the reusable workflows, tested on itself and released as v0.1.0."
status: Done                # Open | Doing | Done | Dropped
depends_on: []              # tasks that must be Done first
decisions: [G-0001, G-0002, G-0003, G-0004, G-0005, G-0006, G-0007, G-0008, G-0009, G-0010, G-0011, G-0012, G-0013, G-0014, G-0015, G-0016, G-0022, G-0025]
raised_on: 2026-11-20
done_on: "2026-11-20"
result: ["https://github.com/SanderGeraedts/harness/pull/1"]                  # PR URLs
---

# Goal

Phase 1. A public repository that holds an AI-first way of working which projects install:

- `decisions/`: the global registry, one record per decision the Engineer settled on
  2026-11-20;
- `rules/AGENTS.md`: the rules every agent reads in a project, with the Requester mode;
- `agents/`: the team (architect, UX designer, developer, tester) as Claude Code subagents;
- `templates/`: the decision, question, task and lessons templates and a project's thin
  `AGENTS.md` and `CLAUDE.md`;
- the `harness` command: `role`, `check`, `tasks-index`, `overrules`, `changes`, `waiting`,
  `sync`, `init`, `hooks`, `protect`, `nas`;
- reusable CI and auto-merge workflows, and the harness's own CI and auto-merge, which holds
  pull requests that touch `decisions/` for the Engineer.

# Done when

- `pnpm test` passes.
- `pnpm run self-test` passes: the packed harness, installed into a throwaway project, runs
  `init`, `sync`, `check`, `tasks-index --check`, `overrules`, `role`, `changes`, `waiting`,
  `protect --dry-run` and `nas` there.
- `pnpm run check` passes on the harness itself.
- The harness's CI is green on the pull request and then on `main`; that commit is tagged
  `v0.1.0`.
- No file names a project, a person, an employer, a network or an address (the licence's
  copyright line and the repository's own name excepted).

# Notes

Built in one piece and delivered as the repository's first pull request. The auto-merge
workflow runs from the default branch, where it doesn't exist until this merges, so this one
pull request is merged by hand once its checks are green. The tag and the ruleset on `main`
(G-0025) follow the merge.

# Design

Nothing visible.

# Test

Run on 2026-11-20 before the first commit, on Windows with Node 24 and pnpm 12.18.0. The
same three commands run in CI on Linux.

`pnpm test`:

```
✔ check (1005.9045ms)
✔ nas (2023.915ms)
✔ protect (17.1626ms)
✔ overrules (62.4288ms)
✔ changes (85.5972ms)
✔ the global registry (31.4979ms)
✔ role (39.8107ms)
✔ waiting (81.7517ms)
✔ sync (390.8056ms)
✔ init (172.3978ms)
✔ front matter (4.8602ms)
✔ tasks-index (86.3206ms)
ℹ tests 47
ℹ suites 12
ℹ pass 47
ℹ fail 0
ℹ skipped 0
```

`pnpm run check`:

```
✓ tasks: 4 tasks, index in step
✓ global decisions: 25 records, index complete
✓ agents: 4 definitions
```

`pnpm run self-test`:

```
$ node scripts/self-test.mjs
 1. pack the harness
 2. create a throwaway project and install the harness into it
 3. harness init
 4. harness sync is idempotent, and harness check passes
 5. the install scripts init added still let pnpm install
 6. a task, a decision that overrules a global one, and an open question
 7. harness overrules
 8. harness check catches an overrule of a decision that does not exist, and a stale generated file
 9. harness role
    gh is signed in: checked engineer as well
10. harness changes
11. harness waiting
12. harness protect builds the ruleset (dry run)
13. harness nas refuses a destructive call, and gets to the connection otherwise
14. the pre-push hook refuses the default branch and lets a feature branch through
✓ self-test passed: 14 steps, harness 0.1.0 in a throwaway project
```

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.
- 2026-11-20 developer: built the registry (25 global decisions), the rules, the team, the
  templates, the command and the workflows. `pnpm test`, `pnpm run self-test` and
  `pnpm run check` pass; output under *Test*.
- 2026-11-20 tester: CI ran the same checks on Linux, on the pull request and on `main`
  after the merge (47 tests pass, self-test passed in 14 steps). Merged by hand as #1, as
  planned; `main` at 8cdfd3f is tagged `v0.1.0`.
- 2026-11-20 developer: the ruleset on `main` (G-0025) is not applied yet: the session was
  not permitted to change the repository's settings. To apply it:
  `node bin/harness.mjs protect "checks / checks"`, then check with
  `gh api repos/{owner}/{repo}/rules/branches/main`.
