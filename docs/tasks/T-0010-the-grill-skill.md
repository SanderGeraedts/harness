---
id: T-0010
title: "Give the team a grill skill that interviews the human before a new project is built"
description: "harness sync writes the team's skills to .claude/skills/, starting with grill: before a new project or a large feature the architect asks one question at a time, each with a recommendation, proposes nice-to-haves and ends with a brief that becomes tasks, decisions and questions; released as 0.8.0."
status: Doing                # Open | Doing | Done | Dropped
depends_on: []              # tasks that must be Done first
decisions: [G-0007, G-0008, G-0010, G-0012, G-0015]
raised_on: 2026-11-21
done_on: ""
result: []              # PR URLs
---

# Goal

The Engineer asked for a new project to be set up "as part of a grill me session", and
expected a skill for it. There was none: the architect answered the request with one long
list of questions instead of an interview. The harness gets a `skills/` folder, shipped like
`agents/`, and its first skill, `grill`:

- `skills/grill/SKILL.md`: the architect interviews the human before a new project or a large
  feature. It reads the decisions first and never asks what they settle, asks one question at
  a time with a recommendation, goes down each branch until it is resolved, keeps to
  behaviour (plain language with a Requester, G-0007), proposes nice-to-haves, and ends with
  a brief that becomes tasks, decisions and questions (`Q-NNN` for what waits on the
  Engineer, G-0010). Nothing is spun up before the brief is agreed.
- `harness sync` writes every `skills/<name>/SKILL.md` to `.claude/skills/<name>/SKILL.md`,
  and `harness check` reports one that is missing or differs, like an agent.
- In the harness, `harness check` also checks the skills: every folder has a `SKILL.md`
  whose `name` matches the folder, with a description.
- The architect's first duty names the skill; the template's `CLAUDE.md`, the rules' list of
  generated files and the README say where skills are.
- Released as 0.8.0, so `harness create` gives a new project the skill.

# Done when

- `pnpm test` passes, with tests for `skillNames`, `checkSkills` and sync writing, keeping
  and refreshing a skill.
- `pnpm run self-test` passes, with the skill in the installed package, written by
  `harness init`, and reported stale by `harness check` after a local edit.
- `node bin/harness.mjs check` prints `✓ skills: 1 skill`.
- In a project synced from this branch, `.claude/skills/grill/SKILL.md` has the front matter
  Claude Code reads for a project skill (`name: grill` and a `description`).

# Notes

- Changes what `harness sync` writes: every project gains `.claude/skills/grill/SKILL.md` and
  a new `.claude/agents/architect.md` on its next update. The README's update notes say so.
- No global decision changes. Whether "grill before a new project" should be a rule backed
  by a global decision is left for later; for now it lives in the architect's duties.

# Design

Nothing visible.

# Test

# Log

- 2026-11-21 architect: raised after the Engineer asked for a grill-me session for a new
  project and no skill existed; scope as in *Goal*, no new decision.
