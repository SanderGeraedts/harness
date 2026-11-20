---
id: T-0009
title: "Make the browser install in CI fast and steady"
description: "Install Playwright's Chromium without the system package step and cache it, in the reusable CI and in the harness's own template-e2e job, because that step took from 30 seconds to over six minutes."
status: Done                # Open | Doing | Done | Dropped
depends_on: []              # tasks that must be Done first
decisions: [G-0011, G-0015, G-0017]
raised_on: 2026-11-20
done_on: "2026-11-20"
result: ["https://github.com/SanderGeraedts/harness/pull/12"]              # PR URLs
---

# Goal

The Engineer reported that `template-e2e` takes a lot of time. Seven recent runs took 30 to
90 seconds, and one took 401 seconds: 385 of them in the self-test's
`playwright install --with-deps chromium`, whose system package install depends on the
package mirrors. A created project's first CI run lost six minutes the same way (T-0003).

- The reusable `ci.yml` and the self-test install the browser without `--with-deps`: the
  GitHub-hosted runner image already has the libraries Chromium needs.
- Both cache `~/.cache/ms-playwright`, keyed on the lockfile, so the download is skipped
  until Playwright's version changes.

# Done when

- `template-e2e` and `checks / checks` pass on the pull request, twice: once filling the
  cache and once using it, with the browser tests still run (`\d+ passed`).
- The job's time on the cached run is reported.

# Notes

If a future runner image lacks a library, the browser fails to start with a clear message;
the fix is then to name that one package, not to bring `--with-deps` back.

# Design

Nothing visible.

# Test

Tester, 2026-11-20, on commit `cd4ea5b` of the pull request's branch (pnpm 12.18.0,
Windows locally; `ubuntu-latest` in CI). **Verdict: passed.** Three observations at the
end; none blocks.

## The check, as run

*Done when* asks for both jobs green twice, once filling the cache and once using it. Run
44765194497 on `cd4ea5b`, read with `gh run view 44765194497 --attempt 1 --log` and
`gh run view 44765194497 --log`:

| | attempt 1 (fills the cache) | attempt 2 (uses it) |
|---|---|---|
| `template-e2e`, whole job | 48s, success | 52s, success |
| its cache step | under 1s | 7s |
| its self-test step | 29s | 26s |
| step 20 of the self-test (browser install and end-to-end tests) | 17.7s | 12.8s |
| `checks / checks`, whole job | 24s, success | 26s, success |

Attempt 1, `template-e2e`:

```
Cache not found for input keys: playwright-Linux-e56c1603205a0e66ba5478615c79c7026a53b3999881ba080da8f06939b1ae51
20. the created project passes its end-to-end tests
✓ self-test passed: 20 steps, harness 0.3.0 in a throwaway project
Cache saved with key: playwright-Linux-e56c1603205a0e66ba5478615c79c7026a53b3999881ba080da8f06939b1ae51
```

Attempt 2, `template-e2e`:

```
Cache hit for: playwright-Linux-e56c1603205a0e66ba5478615c79c7026a53b3999881ba080da8f06939b1ae51
Cache Size: ~293 MB (307324381 B)
Cache restored successfully
20. the created project passes its end-to-end tests
✓ self-test passed: 20 steps, harness 0.3.0 in a throwaway project
Cache hit occurred on the primary key playwright-Linux-e56c…, not saving cache.
```

- **The browser tests ran.** The self-test does not print the output of the commands it
  runs, so the count is not in the log; step 20 fails unless that output matches
  `d+ passed` and has no `d+ (failed|flaky)`, and it passed on both attempts. The
  template's `e2e/items.spec.ts` has no `skip`, `fixme` or `only`.
- **No system package step ran.** Neither log has `apt`, `dpkg`, `sudo` or
  `Installing dependencies`, and no `--with-deps` is left in the repository outside this
  task's text and the comment in `ci.yml`.
- **A project without end-to-end tests is unaffected.** In `checks / checks`, which calls
  the reusable workflow with `e2e` empty, both attempts show `Cache the browser: skipped`,
  `Install the browser: skipped` and `End-to-end tests: skipped`.

Locally, from a clean worktree:

`pnpm install --frozen-lockfile`: `Done in 365ms using pnpm v12.18.0`

`pnpm test`:

```
ℹ tests 111
ℹ pass 111
ℹ fail 0
ℹ skipped 0
```

`pnpm run check`:

```
✓ tasks: 9 tasks, index in step
✓ global decisions: 25 records, index complete
✓ agents: 4 definitions
```

`node scripts/self-test.mjs --e2e` (1m34s on Windows):

```
20. the created project passes its end-to-end tests

✓ self-test passed: 20 steps, harness 0.3.0 in a throwaway project
```

## The workflow changes, as read

- `ci.yml`: the cache step has the same `if: inputs.e2e != ''` as the install and the test
  steps, sits before the install, and stores `~/.cache/ms-playwright`, where Playwright
  puts its browsers on Linux; the job always runs on `ubuntu-latest`. The key is the
  runner's OS and the hash of the project's `pnpm-lock.yaml`.
- `self-ci.yml`: the same path, keyed on `template/pnpm-lock.yaml`, which exists and is the
  lockfile the created project installs from (Playwright 1.65.1).
- With a cache hit, `playwright install chromium` still runs, finds the browser and
  downloads nothing; with a stale or missing cache it downloads. Either way the tests get
  the browser the lockfile asks for.
- A project whose lockfile is not at the root gets the key `playwright-Linux-`: the cache
  then never refreshes after a Playwright update and the install downloads each time.
  Slower, never wrong.

## The risk of leaving out `--with-deps`

A future `ubuntu-latest` image could lack a library Chromium needs. Judged acceptable, and
the note is enough:

- it cannot pass silently: Chromium fails to start, Playwright names the missing
  libraries, and the required check goes red before anything merges;
- the moment it could happen is known (`ubuntu-latest` moving to a new release), and the
  fix is one line;
- the reason is written where the next person looks: the comment above the step in
  `ci.yml`, and this task's *Notes*.

## Observations

1. **The cache makes the job steady, not faster.** Restoring 293 MB took 7s and saved 5s
   of download, so the cached run was 4s slower than the uncached one (52s against 48s).
   The gain of this task is dropping the system package step (30s to 385s before). The
   cache still removes the dependence on the browser download server.
2. **The reusable workflow's browser steps are not run by this repository's CI**, because
   the harness calls it with `e2e` empty. They are the same action, path and command as in
   `template-e2e`, on the same runner image, which did run. A project sees them on its
   first CI run after it moves to the release that carries this change.
3. `actions/cache@v4` gives the warning that it targets Node.js 20 and is forced onto
   Node.js 24, as `pnpm/action-setup@v4` already did.

# Log

- 2026-11-20 architect: Raised from the Engineer's report; cause found in the run timings.
- 2026-11-20 developer: Built in a draft pull request.
- 2026-11-20 tester: passed; both jobs green with and without the cache, `template-e2e` in 48s and 52s.
