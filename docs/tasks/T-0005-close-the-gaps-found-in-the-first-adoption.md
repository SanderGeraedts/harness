---
id: T-0005
title: "Close the gaps found in the first adoption"
description: "Let a project decision be replaced by a global one, let a project add to its generated registry README, give the reusable CI artifact options, and add an adopt path for repositories that already have registries."
status: Done                # Open | Doing | Done | Dropped
depends_on: [T-0002]        # tasks that must be Done first
decisions: [G-0001, G-0002, G-0004, G-0012, G-0015]
raised_on: 2026-11-20
done_on: "2026-11-20"
result: ["https://github.com/SanderGeraedts/harness/pull/4", "https://github.com/SanderGeraedts/harness/pull/6", "https://github.com/SanderGeraedts/harness/pull/7"]                  # PR URLs
---

# Goal

The first project to adopt the harness (T-0002) had to work around four things:

1. **No cross-registry `replaced_by`.** A project decision can't name the `G-NNNN` that
   replaces it; `harness check` only accepts ids from the project's registry. The project
   pointed every replaced decision at one new project decision that maps them. Let
   `replaced_by` name a global decision that exists in the installed harness.
2. **The generated `docs/decisions/README.md` can't be added to.** `check` fails when it
   differs from the template. Give it a marked project section that `sync` keeps.
3. **The reusable CI uploads one fixed artifact** on every run. Add inputs for the artifact's
   name and for uploading only on failure.
4. **No adopt path.** `init` skips existing files silently. Add `harness adopt`: it reports
   what exists, what it would add, and lists the project decisions whose titles match a
   global one, as candidates to replace.

Also from T-0001's open points: run CI on the default branch after a bot merge (a merge made
with `GITHUB_TOKEN` starts no push workflow), and prove the hold path (a pull request that
touches `decisions/` is labelled and waits for the Engineer) on a real pull request.

# Done when

- Tests for each of the four, and the self-test adopts a throwaway project that already has a
  registry with a decision matching a global one.
- `pnpm test`, `pnpm run check` and `pnpm run self-test` pass; a new tag is released.

# Notes

Changing `check`'s rules is a harness change, not a global decision: it doesn't wait for the
Engineer unless it touches `decisions/`.

# Design

Nothing visible: the changes are command output, generated files and workflow inputs.

# Test

Tester, 2026-11-20, on commit `ca9ae72` of the pull request's branch (Node 24.22.1, pnpm
12.18.0, Windows). **Verdict: passed.** Five small observations at the end; none blocks.

## The check, as run

`pnpm install --frozen-lockfile`:

```
Lockfile is up to date, resolution step is skipped
Done in 72ms using pnpm v12.18.0
```

`pnpm test` (the end of its output):

```
ℹ tests 81
ℹ suites 20
ℹ pass 81
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

`pnpm run check`:

```
✓ tasks: 5 tasks, index in step
✓ global decisions: 25 records, index complete
✓ agents: 4 definitions
```

`pnpm run self-test` (exit 0; steps 1 to 14 as in 0.1.0):

```
15. harness check accepts a decision replaced by a global one, and keeps the README's project section
16. harness adopt in a second project that already has a registry with a decision matching a global one

✓ self-test passed: 16 steps, harness 0.2.0 in a throwaway project
```

CI on the pull request: `Harness CI`, `checks / checks`, success (run 44738849282).

## What I tried

In throwaway projects with the packed 0.2.0 tarball installed (`pnpm pack`, `pnpm add -D`),
and with `node bin/harness.mjs` from empty directories.

**1. `replaced_by` naming a global decision** (a project decision D-0001, `status: Replaced`):

- `replaced_by: [G-0016]`: `✓ decisions: 1 records, index complete, 0 overrules valid`, exit 0.
- `replaced_by: [G-9999]`: `✗ decisions: docs/decisions/D-0001-use-pnpm.md: replaced_by names
  G-9999, which isn't in the installed harness's global registry`, exit 1.
- `replaced_by: [G-16]` and `[D-0404, G-0016]`: `names G-16, which doesn't exist`, `names
  D-0404, which doesn't exist`, exit 1.
- `status: Accepted` with `replaced_by: [G-0016]`: `replaced_by is set but status is
  Accepted`, exit 1.
- `replaces: [G-0016]`: `names G-0016, which doesn't exist`, exit 1; only `replaced_by`
  crosses registries.

**2. The registry README's project section:**

- Own text in the section (a table, `$1`, `&`, a backslash): check passes, `sync` says
  `✓ generated files are current`, the text is byte for byte the same afterwards.
- An edit outside the section: check fails as stale; `sync` rewrites the file and keeps the
  section.
- The end marker missing, the start marker missing, the two swapped, a second start marker:
  `check` and `sync` both fail (exit 1) with `the project section's marker lines are
  damaged; ... Restore them, then run harness sync`, and the file is left as it was, with
  the project's text still in it.
- An empty section, a section of 2 MB, text added after the end marker (removed by `sync`,
  as it is outside the section), the file deleted (written again from the template).
- A README without markers (as 0.1.0 wrote it, with own text): stale, and `sync` replaces it
  whole. That is the 0.1.0 behaviour; `adopt` says so before it happens.

**3. The CI inputs.** Read `ci.yml`: `artifact-name` (string, default `ci-artifacts`) and
`artifacts-only-on-failure` (boolean, default `false`); the upload step's condition is
`always() && inputs.artifacts != '' && (failure() || !inputs.artifacts-only-on-failure)`,
which is every run by default and failed runs only when the input is true. The harness's own
CI uses both, and its run on this pull request passed through the reusable workflow. The
upload itself did not run here: no run failed.

**4. `harness adopt`,** in a project with its own `AGENTS.md`, hook, tester definition,
settings, registry README, an index that misses a record, a `prepare` script of its own and
a decision about pnpm:

- Without `--write`: the report lists what is there, what it would add, the five files
  that differ, `docs/decisions/index.md doesn't list D-0002-colours.md`, and the candidate
  `D-0001 ... looks like G-0016 ... (shares: pnpm, package, manager, dependencie,
  installed)`. A SHA-1 over every file outside `node_modules` (53 files, `.git` included)
  and git's `core.hooksPath` were identical before and after; the same with logins and
  `--default-branch` given, and with an unknown option (`✗ unknown option --bogus`, exit 1).
- `adopt --write eng-a --default-branch trunk`: per-file hashes show 12 new files and one
  changed, `package.json`, which gained the `preinstall` script and kept its own `prepare`
  and its four-space indentation. `AGENTS.md`, the hook, `tester.md`, `settings.json`, the
  README and both indexes are unchanged, and `core.hooksPath` is still unset.
- `adopt --write` again: `nothing was missing, so nothing was written`, hashes identical.
  With another `--default-branch`: `! kept .harness/default-branch, which names trunk, not
  other`.
- Then `harness sync`: replaces the four generated files, keeps the project's own `allow`
  rule in the settings, and the hook names `trunk`.
- No `package.json`, and in the harness itself: refused, exit 1, nothing written. An empty
  project: everything listed under *Would add*, no candidates. A title of 5000 words, odd
  characters and capitals, an empty title: no crash; a decision that overrules G-0016 and a
  Replaced one are not listed as candidates.

**5. `init` options:** `init --bogus eng` gives `✗ unknown option --bogus`, exit 1, and
writes nothing; `init --default-branch` gives `✗ --default-branch needs a name`; `init
--write` is refused. A plain `init engineer-one` then works and `harness check` passes.

**The workflows,** read line by line:

- `auto-merge.yml`: the job runs only when `github.event.workflow_run.event ==
  'pull_request'` and the run succeeded, so the CI run it starts on the default branch
  (event `workflow_dispatch`) ends in a skipped auto-merge run and cannot loop. The new step
  runs only after `action == 'merge'`, is skipped when `ci-workflow` is empty, and turns a
  failure to start into a warning. `GH_TOKEN`, `REPO` and `DEFAULT_BRANCH` come from the job's
  `env`. The reusable workflow asks for no permissions; the caller grants them.
- `self-auto-merge.yml`: `actions: write` added, `ci-workflow: self-ci.yml`, `hold-paths:
  "^decisions/"` as before.
- `self-ci.yml`: `workflow_dispatch:` added, `contents: read`, and the artifact inputs. Its
  concurrency group is per ref with `cancel-in-progress`, so two merges close together
  cancel the older run on `main`; the newer one still runs.
- Seen on this pull request: a cancelled CI run (44738810939) was followed by a skipped
  auto-merge run, and the green run on the draft by an auto-merge run that merged nothing.

## Observations for a later task (none blocks)

1. `adopt --write` says `added the preinstall and prepare scripts to package.json` when it
   added only `preinstall` and kept the project's own `prepare`. The file is right; the line
   is not.
2. `adopt --write` stops with exit 1 at a `package.json` that isn't valid JSON or a README
   with damaged markers, after it has already created the files before that point. Nothing
   is overwritten, plain `adopt` reports both problems beforehand, and a second run after the
   repair finishes the job. On the invalid `package.json` the message is the bare parser
   error, without the file's name.
3. The shared words in the candidates list are stemmed: it prints `dependencie`.
4. `init -x` takes `-x` as a login: only options that start with `--` are refused.
5. When `adopt --write` writes nothing but has a `! kept ...` line, the heading still reads
   `added what was missing and overwrote nothing`.
6. Marking a pull request ready seconds after its CI run finished leaves one red auto-merge
   run: the run for the earlier green CI tries to merge while the CI run of the ready event
   is still going, and the ruleset refuses (`the base branch policy prohibits the merge`,
   run 44740152377). The next auto-merge run merged it 30 seconds later. Nothing is wrong
   with the merge; the red run is noise.

## After the merge

- Pull request 4 merged itself as `a194b32`, by the 0.1.0 auto-merge workflow, which starts
  no CI on `main`.
- `gh workflow run self-ci.yml --ref main`: run 44740339530, event `workflow_dispatch`,
  on `a194b32`, success. The auto-merge run it caused (44740395479) was skipped: no loop.
- Tag `v0.2.0` on `a194b32`, pushed.
- The hold path, on pull request 6, which adds a paragraph to `decisions/README.md` and
  was never a draft: CI green (run 44740582172), then auto-merge run 44740675438 with the
  steps `Decide: success`, `Hold for the Engineer: success`, `Merge: skipped`, `Start CI on
  the default branch: skipped`. The pull request is open, has the label
  `waits-for-engineer` and the comment `The checks are green, but this pull request changes
  a path that only the Engineer merges. It waits for the Engineer and will not merge
  itself.`
- No pull request has merged through the 0.2.0 auto-merge yet. The one that carries these
  lines is the first, so whether its merge started CI on `main` can't be written here; the
  tester reports it to the session.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.
- 2026-11-20 developer: built the five parts as 0.2.0, in a draft pull request. (1) `check`
  accepts a `replaced_by` that names a global decision of the installed harness, and fails
  on one that isn't there. (2) The generated registry README ends with a project section
  between two marker lines that `sync` keeps and `check` ignores. (3) The reusable CI has
  the inputs `artifact-name` (default `ci-artifacts`) and `artifacts-only-on-failure`
  (default `false`). (4) `harness adopt` reports what is there, what it would add, which
  generated files differ and which project decisions look like a global one;
  `adopt --write` adds what is missing and overwrites nothing. (5) The reusable auto-merge
  starts the CI workflow named by `ci-workflow` (default `ci.yml`) on the default branch
  after a merge; the harness's own CI has `workflow_dispatch:` and its auto-merge
  `actions: write`.
- 2026-11-20 developer: `pnpm test` passes (81 tests, 20 suites), `pnpm run check` passes
  (5 tasks, 25 global records, 4 agent definitions) and `pnpm run self-test` passes in 16
  steps; step 16 adopts a second throwaway project that already has a registry with a
  decision matching G-0016. `decisions/` is untouched, so the pull request doesn't wait for
  the Engineer. `sync` now writes a different registry README and decision template in
  every project, on its next update.
- 2026-11-20 developer: Remaining: the tester's run and the release tag `v0.2.0`; the
  hold-path proof on a real pull request that touches `decisions/`; and a look at the first
  merge after this one, which is the first that can start CI on `main` by itself (the
  auto-merge workflow runs from `main`, so this pull request's own merge still uses the
  0.1.0 workflow and starts no CI there).
- 2026-11-20 tester: passed. Ran the check from a clean install and tried to break all five
  parts; the result is in *Test*, with five small observations that block nothing.
  Remaining: the merge, CI on `main` and the tag `v0.2.0`; the hold-path proof on a real
  pull request that touches `decisions/`; and a look at the first merge that starts CI on
  `main` by itself.
- 2026-11-20 tester: pull request 4 merged itself as `a194b32`; CI started by hand on `main`
  is green there, and `v0.2.0` is tagged on that commit.
- 2026-11-20 tester: the hold path holds. Pull request 6 touches `decisions/`, was green
  and not a draft, and the auto-merge labelled it `waits-for-engineer`, said so in a
  comment and did not merge it. The evidence is in *Test*, under *After the merge*.
- 2026-11-20 tester: Done. The pull request that carries this line is the first to merge
  through the 0.2.0 auto-merge, which should start CI on `main` by itself; the tester checks
  that run and reports it to the session.
  Remaining: the Engineer reads and merges pull request 6, or closes it.
