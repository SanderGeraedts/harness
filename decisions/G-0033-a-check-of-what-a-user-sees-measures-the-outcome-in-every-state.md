---
id: G-0033
title: "A check of what a user sees measures the outcome in every state the app passes through, and a regression check fails on a fresh build of the base branch"
description: "A Done when or test for anything a user sees checks what is actually rendered or delivered, not an attribute that should lead to it, on first load, after background work changes the data, after navigating away and back, after a reload and at the device extremes the users have; a check meant to fail before the fix is shown failing on a fresh build of the base branch."
status: Accepted            # Accepted | Replaced
date: 2026-11-25
decided_by: engineer
since: 0.10.0               # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: []
replaced_by: []
tags: [process]
---

# Context

In one project, three tasks in a row about which image file a page shows passed their
automated checks and the tester, and then failed on the Engineer's own device. The lessons
each task left (G-0014) say why:

- The checks measured an **intermediate attribute** (the text of an image's candidate list,
  or the width of a file the browser had been offered) instead of what the user gets: the file
  the browser actually decoded and drew. A browser keeps a larger file it has already loaded,
  so the attribute was right while the picture was wrong.
- The checks ran in **one state**: a fresh page load on freshly made data. The failures came
  in the states after it: records made before the change or downloaded from elsewhere,
  background work that rewrote the data while the page stayed open, a return from another
  view, a reload.
- The checks ran at **some device settings only**: two high pixel ratios, not the ratio of 1
  that the Engineer's laptop has, and with a tolerance (a downscale up to 3x) loose enough to
  pass what still looked wrong.
- A check meant to fail before the fix **passed on the base branch by mistake**: the local
  preview server still served the branch's own build.

The harness's own lessons have the same shape: a screen that the review said was checked on
a phone, while nothing compared the page's width with the screen's.

# Decision

- **The outcome, not the means.** A *Done when* or test for anything a user sees or
  receives checks the observable result: what is rendered, decoded, delivered or stored.
  An attribute, setting or request that should lead to it may be checked as well, never
  instead.
- **Every state the app passes through.** The check runs on a first load and again after
  each thing that can change the result while the app runs: background work or sync that
  changes the data, navigating away and back, a reload, and data that came from elsewhere or
  from before the change.
- **The device extremes the users have.** Where the result depends on the device (screen
  size, pixel ratio, input, network), the check runs at both ends of what the users have,
  including the plainest (for example a pixel ratio of 1).
- **Tolerances from what a user notices,** not from what the current build happens to give.
- **A regression check is shown to fail first,** against a build of the base branch made
  fresh for that run, never the branch's own build or a server still serving it; the
  failing output goes in the task's *Test*.

# Rationale

A test that reads the means proves the code did what the developer thought would work; only
reading the outcome proves the user gets it. Bugs that survive a first load live in the
transitions, so a check that skips them passes exactly the bugs that reach production. A
regression check that never failed proves nothing, and a stale build makes it look as if it
did.

# Consequences

- The architect's *Done when* for anything visible names the outcome to read and the states
  and device extremes to read it in.
- The tester runs those states and adds any further state the change makes possible, and
  sends back a check that reads only an attribute.
- The rules and agent definitions change, so a project's next `harness sync` rewrites
  `.claude/agents/`.
- Checks get longer. A state that can't change the result for this task (nothing runs in
  the background, nothing is device-dependent) is named and skipped in one line, not left
  out silently.

# Guidance for agents

- Ask: "what would the user see go wrong?" and read exactly that, in the browser or client
  the user has (for an image, the decoded size of the file actually shown; for a layout, the
  page's width against the screen's).
- List the states the app passes through for this change in *Done when*, and check each.
- Before "this fails on the base branch", rebuild the base branch and stop any server still
  serving the branch's build.
