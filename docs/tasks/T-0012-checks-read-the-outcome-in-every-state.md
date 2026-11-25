---
id: T-0012
title: "Make checks of what a user sees read the outcome in every state"
description: "Build what G-0033 decides once the Engineer accepts it: the rules, the architect, developer and tester definitions and the task template ask for checks that read what is rendered or delivered, in every state the app passes through and at the device extremes, and for regression checks shown failing on a fresh build of the base branch; released as 0.10.0."
status: Open                # Open | Doing | Done | Dropped
size: small                 # small | full: the architect sizes it (G-0031)
depends_on: []              # tasks that must be Done first
decisions: [G-0014, G-0015, G-0031, G-0033]
raised_on: 2026-11-25
done_on: ""
result: []                  # PR URLs
---

# Goal

A project's lessons showed the same failure three times: checks of which image a page shows
passed the automated run and the tester, then failed on the Engineer's device, because they
read an attribute instead of what was drawn, ran only on a fresh load, skipped a pixel ratio
of 1, and once "failed on main" against the branch's own build (see G-0033's Context). This
task puts G-0033 into what every project reads, after the Engineer accepts it.

1. **`rules/AGENTS.md`, under *Prove your work*:** add

   > - **Check the outcome, in every state** (G-0033). For anything a user sees, a check
   >   reads what is rendered or delivered, not an attribute that should lead to it, on a
   >   first load and after each thing that can change it while the app runs (background
   >   work or sync, navigating away and back, a reload, data from elsewhere or from before
   >   the change), and at both ends of the devices the users have. A check meant to fail
   >   before the fix is shown failing on a fresh build of the base branch.

2. **`agents/architect.md`, duty 2:** a *Done when* for anything a user sees names the
   outcome to read and the states and device extremes to read it in, or says in one line
   why a state can't change it (G-0033).
3. **`agents/developer.md`:** before hand-over, run the new check in each state the *Done
   when* names; when it is a regression check, show it failing on a fresh build of the base
   branch (stop any server still serving the branch's build).
4. **`agents/tester.md`, duties 3 and 4:** send back a check that reads only an attribute;
   run the named states and add any state the change makes newly possible; repeat the
   "fails before the fix" run on a fresh build of the base branch.
5. **`templates/task.md`:** the *Done when* hint mentions the outcome and the states.
6. Version 0.10.0.

# Done when

- `grep -n "G-0033" rules/AGENTS.md agents/architect.md agents/developer.md agents/tester.md`
  shows a line in each of the four files.
- `pnpm test` and `pnpm run self-test` pass; `node bin/harness.mjs check` passes ("✓ global
  decisions: 33 records, index complete").
- In a throwaway project from `harness create`, `harness sync` writes the new architect,
  developer and tester lines into `.claude/agents/` (a self-test step reads them).

# Notes

- Waits for the Engineer to accept G-0033 (its pull request touches `decisions/`, G-0006).
- Changes what `harness sync` writes (agent definitions, the task template): every project
  gets them on its next update. Say so in the pull request.
- Keep the wording project-neutral: no project, person, host or device named.
- Nothing visible in the harness itself, so no UX designer.

# Design

Nothing visible.

# Test

# Log

- 2026-11-25 architect: raised from a lesson that repeated three times in a project (checks
  of what a user sees read an attribute in one fresh state, and a "fails on the base branch"
  run used the branch's own build); G-0033 drafted for the Engineer; small (rules and agent
  text only).
