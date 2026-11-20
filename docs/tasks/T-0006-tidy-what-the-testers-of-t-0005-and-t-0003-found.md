---
id: T-0006
title: "Tidy what the testers of T-0005 and T-0003 found"
description: "Small defects in adopt, init, create and the auto-merge workflow that the testers listed and that blocked neither task."
status: Open                # Open | Doing | Done | Dropped
depends_on: []              # tasks that must be Done first
decisions: [G-0011, G-0015, G-0024]
raised_on: 2026-11-20
done_on: ""
result: []                  # PR URLs
---

# Goal

The testers of T-0005 and T-0003 passed both tasks and listed small defects that did not
block them. This task fixes them, each with a test (G-0015).

From T-0005's tester:

1. `adopt --write` says it added both scripts when it added only `preinstall`.
2. `adopt --write` exits after creating earlier files when `package.json` is invalid or the
   README's markers are damaged, and the invalid-JSON message lacks the file name.
3. The candidates list prints a stemmed word like "dependencie".
4. `init -x` treats `-x` as a login.
5. `adopt --write` keeps the heading "added what was missing" when it only kept things.
6. Marking a pull request ready seconds after its CI finished leaves one red auto-merge
   run.

From T-0003's tester:

7. `create --git-name` and `--git-email` take a value that starts with a dash as it is
   (`--git-name=--global`, `--git-email -x@y.z`), and it becomes the first commit's author
   to the letter. Refuse it.
8. When copying the template itself fails, `create` leaves the half-made folder; only the
   steps after the copy clean up.
9. In the template's edit form, a title without a space drops below the arrow of the back
   link.

# Done when

- Each of 1 to 5, 7 and 8 has a unit test or a self-test step that fails before the fix and
  passes after it, and `pnpm test`, `pnpm run self-test` and `pnpm run check` pass.
- 6: a pull request marked ready within seconds of its CI run finishing merges with no red
  auto-merge run, shown on a pull request of the harness itself.
- 9: the UX designer has looked at the edit form at 320px with such a title and said it is
  right.

# Notes

- 1 to 5: `lib/adopt.mjs`, `lib/init.mjs`. 6: `.github/workflows/auto-merge.yml`; changing
  it changes every project on its next update, so say so in the pull request. 7 and 8:
  `lib/create.mjs`. 9: `template/src/routes/ItemForm.tsx`.
- Not part of this task, and waiting for the Engineer since T-0003: whether new
  repositories stay private by default now that GitHub refuses a ruleset on a private
  repository on a free plan; whether the ruleset should also require `template-e2e`; and
  deleting the throwaway repository of T-0003's live run. The architect records the first
  two as open questions.

# Design

Nothing new to see, except 9: the back link of the edit form with a long title.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.

- 2026-11-20 tester: raised, from the *Test* sections of T-0005 and T-0003.
- 2026-11-20 architect: of the three points in *Notes* that waited for the Engineer, the
  first is decided: new repositories stay private, and get their ruleset when they are
  public (G-0029); T-0007 changes `create`'s wording. The other two still wait.
