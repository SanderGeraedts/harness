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

2026-11-21 tester, first run, on `ec580bc`, from `pnpm install --frozen-lockfile`.

**The Done-when checks**, as written:

- `pnpm test`: `tests 259, pass 258, fail 0, skipped 1` (the skipped one is the existing
  bash-and-jq test, `# needs bash and jq`). The new tests ran: `checkSkills` (folder without
  `SKILL.md`, a name that differs, no description, no folder), sync writing the skill as it
  is, keeping a project's own skill, and reporting an edited one stale.
- `pnpm run self-test`: `✓ self-test passed: 31 steps, harness 0.8.0 in a throwaway project`,
  exit 0. Steps 1, 3 and 8 cover the skill in the package, written by `init`, and stale after
  a local edit. Nothing in these 31 steps needs Docker; the Docker-backed sign-in and sync
  tests are only under `--e2e`, which CI's `template-e2e` job runs.
- `node bin/harness.mjs check`:
  ```
  ✓ tasks: 10 tasks, index in step
  ✓ global decisions: 30 records, index complete
  ✓ agents: 4 definitions
  ✓ skills: 1 skill
  ```
- Throwaway project: `pnpm pack`, `pnpm add -D` of the tarball, `pnpm exec harness init
  engineer-one` printed `wrote .claude/skills/grill/SKILL.md`. Its front matter parsed with a
  YAML parser: `name= grill | description chars= 389 | keys= name,description`.
  `pnpm exec harness check` there: all four lines ✓, `generated files: current`.
- `gh pr checks 19`: `checks` pass, `template-backend / image` pass, `template-e2e` pass,
  `template-backend / publish` skipping (as on every pull request). `mergeable: MERGEABLE`.

**Tried to break it:**

- `checkSkills` on a folder with a skill folder without `SKILL.md`, a loose file, a CRLF
  `SKILL.md`, a quoted name, folder `Case` with `name: case`, no front matter, an empty name:
  every bad one is reported, the CRLF and quoted ones pass, the loose file is ignored. Small:
  without front matter the message says `name "undefined"`; folder names aren't checked
  against what Claude Code allows (lowercase, digits, hyphens). Neither matters for `grill`.
- A project's own skill (`.claude/skills/mine/`) and an extra file inside
  `.claude/skills/grill/` survive `sync`; a CRLF copy of the generated skill is not stale.
- `harness adopt` with a project's own `.claude/skills/grill/SKILL.md`: listed under *Differs*
  as `sync replaces it`; `adopt --write` keeps it, and `check` then reports it stale.
  `harness init` overwrites it, exactly as it does an existing `.claude/agents/tester.md`.
- `pnpm pack --dry-run` lists `skills/grill/SKILL.md`; `files` in `package.json` has `skills`.
- Only `SKILL.md` is synced, not other files in a skill folder: fine for `grill`, worth
  knowing for a later skill.

**Read against the rules and the global decisions:** `skills/grill/SKILL.md` contradicts
G-0020. It says "Never ask what a decision already answers: the stack, hosting, the backend,
offline-first, readable addresses and private repositories are settled for a new project
(G-0016 to G-0021, G-0029)". G-0020 says offline-first is a *suggestion*, "dropped when it
makes no sense for the project", and its guidance is that the architect *proposes* it and
records the choice either way, and asks the Requester about look and language. The range
G-0016 to G-0021 also takes in G-0020's look and language, which the skill then never asks
about. A grill that follows the skill skips exactly the questions G-0020 says to ask.

**The record:** the task has no developer Log line and `result` is still `[]`, though the
pull request delivers the work (G-0012: status, Log and `result` move in the pull request).

**Verdict: sent back.** All checks pass, but (1) the skill contradicts G-0020: offline-first
must be proposed and the choice recorded, and look and language asked, not treated as
settled; (2) the developer's Log line and `result` (#19) are missing.

# Log

- 2026-11-21 architect: raised after the Engineer asked for a grill-me session for a new
  project and no skill existed; scope as in *Goal*, no new decision.
- 2026-11-21 tester: sent back: the checks pass (259 tests, 0 failed; self-test 31 steps;
  `✓ skills: 1 skill`; CI green), but `skills/grill/SKILL.md` lists offline-first among what
  is settled and never asked, where G-0020 makes it a suggestion the architect proposes and
  records either way, with look and language asked per project; and the task has no
  developer Log line and no `result`. See *Test*.
