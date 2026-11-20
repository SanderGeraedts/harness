---
id: T-0009
title: "Make the browser install in CI fast and steady"
description: "Install Playwright's Chromium without the system package step and cache it, in the reusable CI and in the harness's own template-e2e job, because that step took from 30 seconds to over six minutes."
status: Doing               # Open | Doing | Done | Dropped
depends_on: []              # tasks that must be Done first
decisions: [G-0011, G-0015, G-0017]
raised_on: 2026-11-20
done_on: ""
result: []                  # PR URLs
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

# Log

- 2026-11-20 architect: Raised from the Engineer's report; cause found in the run timings.
- 2026-11-20 developer: Built in a draft pull request.
