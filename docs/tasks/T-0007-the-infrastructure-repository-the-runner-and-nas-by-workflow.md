---
id: T-0007
title: "Generate the private infrastructure repository, install the runner on the NAS, and run harness nas through a workflow"
description: "harness infra init generates the thin private infrastructure repository, harness infra runner installs a self-hosted runner as an app on the NAS, and harness nas --remote calls the TrueNAS API through a workflow there, with the key from the GitHub environment; released as 0.6.0 with the rules for G-0026 to G-0029."
status: Doing               # Open | Doing | Done | Dropped
depends_on: [T-0003]        # tasks that must be Done first
decisions: [G-0007, G-0009, G-0011, G-0015, G-0026, G-0027, G-0028, G-0029]
raised_on: 2026-11-20
done_on: ""
result: ["https://github.com/SanderGeraedts/harness/pull/15"]  # PR URLs
---

# Goal

Slice 1 of T-0004, whose *Notes* hold the architecture; read them first.

After this task, a session with the Engineer can call the NAS's API from any machine,
without a key on that machine:

- **`harness infra init`** generates the Engineer's private infrastructure repository: thin
  caller workflows for the harness's reusable ones, and a README. It checks that the GitHub
  environment has its four secrets, by name.
- **`harness infra runner install`** installs a self-hosted GitHub Actions runner as an app
  on the NAS, registered to that repository. Once, from the Engineer's session at home.
- **`harness nas --remote <method>`** starts the `nas` workflow there, waits, and prints the
  result. The workflow runs `harness nas` on the runner, with the key from the environment.
- The harness's rules, README and messages follow G-0026 to G-0029, and the version is
  0.6.0 (0.4.0 was never tagged; T-0008 took 0.5.0).

# Done when

1. `pnpm test`, `pnpm run self-test` and `pnpm run check` pass. The self-test has steps for:
   - `harness infra init --dir <folder>` writing the repository's files into a folder
     without touching GitHub: four caller workflows and a README; every `uses:` is pinned
     to the running harness's tag; each passes `secrets: inherit` and the environment's
     name; a search of the folder finds no host, address, path or token;
   - `infra init`, `infra runner` and `nas --remote` refusing an account that is not the
     Engineer, and stopping with a plain message when no infrastructure repository is set;
   - `harness nas --remote pool.dataset.delete '["x"]'` exiting 2 with the "is destructive"
     message, before any workflow is started;
   - `harness changes v0.3.0 v0.4.0` listing G-0026 as added and G-0022, G-0024 and G-0025
     as replaced.
2. **Live, the repository.** In a session with the Engineer: `harness infra init` on the
   private infrastructure repository ends with `✓` lines for the files, the environment and
   each of the four secret names, and run again says nothing changed.
3. **Live, the runner.** At home, with the NAS's address, key, fingerprint and parent
   dataset in the Engineer's environment: `harness infra runner install` ends with the
   runner online. `harness infra runner status`, from any machine, prints `online`. After
   the app is restarted on the NAS it prints `online` again, with no new token.
4. **Live, a call.** From a machine that is not on the home network and has no `TRUENAS_*`
   variable: `harness nas --remote core.ping` prints `"pong"`.
5. **Nothing leaked.** The registration token is never printed and is gone from the app's
   configuration after the install (`harness nas --remote app.config` on the runner app
   shows none). This pull request's diff and the generated repository hold no host name,
   address, dataset path or token.
6. `v0.6.0` is tagged on a green `main`.

# Notes

## Before it starts

- The pull request with G-0026 to G-0029 must be merged: this task's rules and messages
  name them, and 0.4.0 is the version their `since` and `changed` name.
- The Engineer has run `gh auth refresh -s workflow`.

## The commands

- **Who may run them:** the Engineer only. Inside a project, the signed-in account must be
  in `.harness/engineers`; anywhere, it must have admin rights on the private
  infrastructure repository.
- **The settings** are in T-0004's *The settings*. `harness infra init --repo owner/name`
  also writes the repository's name to a user-level settings file, so later commands on that
  machine find it; `HARNESS_INFRA_REPO` wins over the file. No default name exists.
- **`harness infra init [--repo owner/name] [--environment <name>] [--dir <folder>]`:**
  - creates the repository, private, when it doesn't exist; never changes its visibility;
  - writes the generated files. Into a new, empty repository as its first commit; into an
    existing one through a pull request it opens and, when the diff holds generated files
    only, merges;
  - checks the environment and the four secret names with `gh secret list --env`. A missing
    one is a line for the Engineer, not something to fix;
  - `--dir` writes the files to a folder and stops: for the self-test.
- **`harness infra runner install | status`:**
  - `install` runs at home and uses the NAS client locally, with `TRUENAS_HOST`,
    `TRUENAS_API_KEY`, `TRUENAS_CERT_SHA256` and `TRUENAS_APPS_DATASET` from the Engineer's
    environment. It is the one step that needs a key on a machine;
  - it creates a dataset for the runner under the parent dataset, gets a registration token
    from `gh api` (valid for an hour), and creates the app with it. The token goes from `gh`
    to the NAS inside the process: never to the output, a file or a command line;
  - the app's configuration carries the NAS's address, the fingerprint and the parent
    dataset, for the jobs that run on it;
  - when the runner shows as online, it updates the app to drop the token;
  - the runner: the official runner image at a pinned version, labelled `self-hosted` and
    `harness-nas`, registered to the one repository, its registration kept on its dataset.
    No container socket, no other dataset (G-0027);
  - `status` reads `gh api repos/<repository>/actions/runners`.
- **`harness nas --remote <method> [params-json] [--job] [--confirmed]`:**
  - refuses a destructive method without `--confirmed` locally, exactly as `harness nas`
    does, before starting anything;
  - starts `nas.yml` with the method, the parameters, and whether it was confirmed; finds
    its run by a request id in the run's name; waits; prints the result the run recorded;
  - what it prints may name a dataset or a host: it is for the session, never for a file.

## The workflows

- `infra-nas.yml` and `infra-check.yml`, reusable, in the harness. Their jobs name the
  environment given as an input, run on `[self-hosted, harness-nas]`, check out the harness
  at the tag given as an input, and run one `harness` command.
- `infra-check.yml` proves the whole chain with a harmless call. `infra init` offers to
  start it.
- One NAS job at a time (a `concurrency` group).
- The first `nas.yml` run proves that a reusable workflow's job gets the caller's
  environment secrets (T-0004, *Risks to prove early*). If not: generate the jobs in full.

## The NAS client

- `lib/nas.mjs` is a command that exits the process. Split it: a client that connects,
  checks the fingerprint, signs in and makes any number of calls, and the command on top of
  it. The destructive list and the fingerprint check don't change. T-0004 builds on the
  client.

## Conforming to the new decisions

- `rules/AGENTS.md`, the README and `agents/`: G-0027 instead of G-0022, G-0028 instead of
  G-0024, G-0029 instead of G-0025, and the rule that no agent reads, prints or carries a
  secret (G-0026). Changing `rules/AGENTS.md` changes every project on its next update: say
  so in the pull request.
- `create`'s message for a private repository: not a warning. One `Remaining:` line that
  says the default branch gets its ruleset when the repository is public, with the command
  (G-0029).
- `package.json` to 0.6.0.

# Design

Nothing visible in an app. The commands print one `✓` line per step, as `create` does.

As built: `✓` for a step done or already there, `! Remaining:` for what only the Engineer can
add (a secret, the environment, the runner's install), `·` for a secret that isn't needed
yet (`GHCR_PULL_TOKEN`), and `✗` with the reason when a command stops. `harness infra
runner status` prints one line, `harness-nas: online` (or `offline`, or `not installed`).
`harness nas --remote` prints only what the run recorded, as `harness nas` would locally.

# Test

2026-11-20, tester, on `47818d1` in a fresh worktree. **Sent back**: the generated
`project-up.yml` is not valid YAML (Done-when 2 and 5 test a generated repository that has a
broken workflow). Everything else held.

## Checks (Done-when 1)

- `pnpm install --frozen-lockfile`: "Done in 277ms using pnpm v12.18.0".
- `pnpm test`: "tests 173, pass 173, fail 0".
- `pnpm run check`: "✓ tasks: 9 tasks, index in step / ✓ global decisions: 29 records, index
  complete / ✓ agents: 4 definitions".
- `pnpm run self-test` (no `TRUENAS_*` set): "✓ self-test passed: 27 steps, harness 0.6.0 in
  a throwaway project"; steps 10 and 13 to 17 are the Done-when 1 steps.
- `node scripts/self-test.mjs --e2e`: "✓ self-test passed: 29 steps, harness 0.6.0 in a
  throwaway project" (no Docker here, so the sign-in and sync e2e tests were left out, as
  step 28 says).

## Live, with every `TRUENAS_*` variable unset in the shell (the count printed 0)

On the home LAN, so this is not Done-when 4; it proves only that the remote path needs no
`TRUENAS_*` on the machine.

- `harness nas --remote core.ping`: `"pong"`, exit 0, 31 s.
- `harness nas --remote system.info`: exit 0; TrueNAS 25.10.8, 16 cores, up about 34 hours
  (host name, serial and the rest not copied here).
- `harness infra check`: exit 0, ✓ for the four secrets, "· the secret GHCR_PULL_TOKEN isn't
  there yet", "✓ the runner's configuration: TRUENAS_HOST, TRUENAS_CERT_SHA256,
  TRUENAS_APPS_DATASET", "✓ the NAS answers: core.ping gave "pong"".
- `harness infra runner status`: "harness-nas: online (self-hosted, Linux, X64,
  harness-nas)", exit 0.
- `harness infra init --harness-ref <the pinned merge commit>` a second time: "✓ files:
  nothing changed", ✓ environment, ✓ four secrets, · GHCR_PULL_TOKEN, "✓ the runner
  harness-nas: online", exit 0. (Not run without `--harness-ref`: that would pin the
  repository to `v0.6.0`, which doesn't exist yet.)

## Tried to break it

- `nas --remote pool.dataset.delete '["x"]'` and `nas --remote app.delete
  '["harness-runner"]'`: both "… is destructive (G-0027): ask the Engineer in chat, then
  rerun with --confirmed.", exit 2. The newest run id on the infrastructure repository was
  the same before and after: no workflow started.
- Malformed params: `'[oops'` gives "params must be a JSON array: Unexpected token …", exit
  1; `'{"a":1}'` gives "params must be a JSON array, like '["<app>"]'.", exit 1. No run
  started.
- A method that doesn't exist (`no.such_method`): a run, then "no.such_method failed: Method
  does not exist" and the JSON-RPC error, exit 1.
- No repository set: "✗ No private infrastructure repository is set (G-0026). …", exit 1.
  No method: the usage line, exit 1.
- `infra init --repo <another owner>/does-not-exist`: "✗ only the Engineer may change the
  infrastructure (G-0026): … can't see …, and it can only be created under …", exit 1.
  `infra runner status` on a repository that doesn't exist: "… can't see …", exit 1. `--repo
  foo`: "isn't a repository as owner/name". `--harness-ref 'a b;rm'`: "isn't a tag, branch
  or commit". (Not tried: `init` on a non-existent repository under the Engineer's own
  account, because that creates one.)
- No runner picks up the job (read, not run): `runWorkflow` polls every 3 s; after 20 polls
  in `queued`/`waiting`/`pending` (about a minute) it asks for the runner and, when it isn't
  online, cancels the run and stops with "the runner harness-nas on the NAS is offline, so
  the run was cancelled: <url> / See harness infra runner status." A run that never ends
  stops after 400 polls (about 20 minutes) with "the run is still going after a long wait".
  The job itself has `timeout-minutes: 30` (nas) and 15 (check). Tested in
  `test/infra.test.mjs` ("cancels a run that waits for an offline runner").
- A non-Engineer (read, not run): `requireListedEngineer` refuses a login not in
  `.harness/engineers` before any setting is read; `requireAdmin` refuses without admin
  rights and refuses a repository that isn't private. Covered by `test/infra.test.mjs` and
  self-test step 16.

## Leaks (Done-when 5)

- The PR diff and a fresh clone of the infrastructure repository, searched for the NAS's
  host, its host name (from `system.info`), the fingerprint (with and without colons), IPv4
  addresses, `.ts.net`, `/mnt/` and the infrastructure repository's name: no hits, except
  the Log line that names these words and `secrets.NETLIFY_AUTH_TOKEN` (a false `ts.net`
  match).
- The six latest workflow runs' logs: secrets show as `***` only (`TRUENAS_API_KEY`, the
  checkout token); no registration token, no `ghp_`/`ghs_`/PAT, and neither the host, host
  name nor fingerprint in plain text. The result is in the log as base64 marker lines, by
  design, in a private repository.
- `harness nas --remote app.config '["harness-runner"]'`: one service, image
  `ghcr.io/actions/actions-runner:2.338.2`; environment names `HOME, RUNNER_LABELS,
  RUNNER_NAME, RUNNER_URL, TRUENAS_APPS_DATASET, TRUENAS_CERT_SHA256, TRUENAS_HOST`: **no
  `RUNNER_TOKEN`** (the name appears only in the entrypoint script, which reads and unsets
  it); one volume `<redacted>:/state`; **no container socket**; not privileged.
- The environment `Prod` holds the four secret names; the only collaborator is the
  Engineer.

## The workflows, read

- `workflow_call` inputs reach the job as environment variables, never interpolated into
  `run:`; `environment: ${{ inputs.environment }}`; `permissions: contents: read`;
  `concurrency: harness-nas`, no cancelling; `runs-on: [self-hosted, harness-nas]`; the
  harness checked out at the pinned ref with `persist-credentials: false`. Good.
- The destructive list is checked again on the runner: `infra job nas` goes through
  `runLocal`, which exits 2 for a destructive method unless `NAS_CONFIRMED` is `true`. But
  `confirmed` is a dispatch input, so whoever can start `nas.yml` by hand can set it. Today
  that is only the Engineer (sole collaborator, private repository). See defect 2.

## Defects

1. **Blocking: the generated `project-up.yml` is not valid YAML.** Its `sync` input's
   description is the plain scalar `The project syncs: it gets a backend`, and `: ` inside a
   plain scalar is a YAML error ("mapping values are not allowed here", line 18, column 39).
   To see it: `node bin/harness.mjs infra init --dir out`, then parse
   `out/.github/workflows/project-up.yml` with any YAML parser; or the infrastructure
   repository's Actions tab, where every push to `main` has a failed run of
   `.github/workflows/project-up.yml` ("This run likely failed because of a workflow file
   issue", 8 of the last 30 runs). The Log says the stubs exist "so the callers are valid
   now"; this one isn't. No test parses the generated workflows: one that loads each with a
   YAML parser (and quotes every description) would catch it.
2. Not blocking, for the architect: the `Bash(*--confirmed*)` ask rule doesn't match `gh
   workflow run nas.yml -f confirmed=true -f method=…`, so an agent in the Engineer's session
   could start a destructive call on the NAS without the permission prompt, bypassing the
   CLI's check. An ask rule for `gh workflow run*` (or `*confirmed=true*`), or a protection
   rule on the `Prod` environment, would close it.
3. Not blocking: `harness infra runner status` and `infra check` refuse with "only the
   Engineer may **change** the infrastructure", though they change nothing.

**Verdict: sent back to the developer** for defect 1. The pull request stays a draft.

## Second run

2026-11-20, tester, on `d8dbf2b` in a fresh worktree. **Passed.**

- `pnpm install --frozen-lockfile`: "+ yaml 2.9.1 … Done in 323ms using pnpm v12.18.0".
- `pnpm test`: "tests 190, pass 190, fail 0". `pnpm run check`: tasks, global decisions and
  agents ✓.
- `pnpm run self-test`: "✓ self-test passed: 28 steps, harness 0.6.0 in a throwaway
  project"; `node scripts/self-test.mjs --e2e`: "✓ self-test passed: 30 steps".
- **Defect 1, fixed.** With the old `lib/infra/callers.mjs` (from `3b1889f`) put back,
  `node --test test/infra.test.mjs` gives "pass 53, fail 3", among them "project-up.yml
  (Prod) isn't valid YAML"; with the new one, "pass 56, fail 0". A fresh clone of the
  infrastructure repository (main at its PR #5, pinned to `8d12194`): all four workflows
  parse with no error or warning. Its runs since #5 are one `nas` and one `check`, both
  success; no failed workflow-file run, and no push run at all.
- **Defect 2, fixed.** `.claude/settings.json` and `requiredSettings` ask before
  `*confirmed=true*` for Bash and PowerShell, next to `*--confirmed*`; `rules/AGENTS.md`
  says never to start an infrastructure workflow with `gh workflow run` directly; self-test
  step 17 checks the four rules.
- **Defect 3, fixed.** `infra runner status` on a repository that can't be seen: "✗ only the
  Engineer may look at the infrastructure (G-0026): … can't see …", exit 1.
- **The failed `nas` run at 18:56 on the old pin** was the first run's `no.such_method`
  test: its log has `NAS_METHOD: no.such_method`, "harness nas: exit 1", and a result that
  decodes to "no.such_method failed: Method does not exist".
- **Live, `TRUENAS_*` unset (count 0), on the home LAN:** `nas --remote core.ping`:
  `"pong"`, exit 0; `nas --remote system.info`: TrueNAS 25.10.8, 16 cores; `infra check`:
  exit 0, the four secrets ✓, `GHCR_PULL_TOKEN` not there yet, configuration ✓, "core.ping
  gave "pong""; `infra runner status`: "harness-nas: online (self-hosted, Linux, X64,
  harness-nas)"; `nas --remote pool.dataset.delete '["x"]'`: exit 2 with the "is
  destructive" message, and `'[oops'` exit 1, with the newest run id unchanged (no run
  started); `infra init --harness-ref 8d12194…` a second time: "✓ files: nothing changed",
  environment, four secrets and runner ✓, exit 0.
- **Leaks:** the PR diff and the regenerated repository hold neither the NAS's host, host
  name, fingerprint (with or without colons), an IPv4 address nor the infrastructure
  repository's name (`/mnt/` and `.ts.net` only in Log and Test lines that name the
  search). The five newest run logs: the key only as `***`, no registration or GitHub
  token, no host, host name or fingerprint. `app.config` of the runner app: image
  `actions-runner:2.338.2`, no `RUNNER_TOKEN` in its environment, one volume, no socket, not
  privileged.
- Not blocking: the PR body's "No change to `.claude/`" line predates the fix; its later
  section says plainly that `.claude/settings.json` changes.

**Verdict: passed.** Done-when 1, 2 (up to the re-pin to the tag), 3 and 5 hold; 4 needs a
machine off the home network, and 6 is the tag after the merge.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.

- 2026-11-20 architect: raised as slice 1 of T-0004. Decided the runner on the NAS as the
  way a workflow reaches the NAS's API, and that the NAS's address, fingerprint and parent
  dataset live in the runner's configuration. Handed to the developer; nothing waits on a
  question.
- 2026-11-20 developer: built it in #15. `lib/nas-client.mjs` (connect, fingerprint, sign
  in, `call`, `job`) with `lib/nas.mjs` as the command on top; `harness nas --remote`;
  `harness infra init | check | runner install | runner status` (`lib/infra.mjs`,
  `lib/infra/`); reusable `infra-nas.yml` and `infra-check.yml`; the rules, README, agents
  and messages for G-0026 to G-0029; 0.4.0. `pnpm test`: 159 pass, 0 fail. `pnpm run
  self-test`: "✓ self-test passed: 23 steps, harness 0.4.0 in a throwaway project" (steps
  10 and 13 to 17 cover Done-when 1). `pnpm run check`: tasks, global decisions and agents
  ✓.
- 2026-11-20 developer: live, with the Engineer's authorisation, from a machine on the home
  network. The runner: `harness infra runner install` ended "✓ the runner harness-nas:
  online after a restart without the token"; run again: "already there, nothing changed".
  After `app.stop` the status was `offline`, after `app.start` `harness-nas: online
  (self-hosted, Linux, X64, harness-nas)`, with no new token. `harness nas --remote
  app.config` on the runner app: no `RUNNER_TOKEN` in its environment, one volume, no
  socket. The repository: `harness infra init` (pinned to this branch's commit, because
  v0.4.0 isn't tagged yet) merged its files through the repository's own pull request,
  with ✓ for the environment and the four secrets and "· GHCR_PULL_TOKEN isn't there yet";
  run again: "✓ files: nothing changed". With no `TRUENAS_*` variable set: `harness nas
  --remote core.ping` printed `"pong"` (so a reusable workflow's job does get the caller's
  environment secrets: the generator keeps calling reusable workflows); `harness nas
  --remote pool.dataset.delete '["x"]'` exited 2 with the "is destructive" message; `harness
  infra check` exited 0 with the four secrets ✓, the runner's configuration ✓ and "core.ping
  gave "pong"". A search of this pull request's diff and of the repository's files for the
  NAS's host, pool, dataset, fingerprint, IPv4 addresses, `/mnt/` and `.ts.net` found none.
- 2026-11-20 developer: for the architect, beyond the task. (1) `project-up.yml` and
  `project-down.yml` call `infra-project-up.yml` / `infra-project-down.yml`, which are stubs
  that fail with "arrives with harness 0.7.0" so the callers are valid now; T-0004 replaces
  them and their inputs. (2) Added `harness infra check` (what `init` offers to start),
  `--harness-ref` on `init`, and the internal `harness infra job nas | check` the workflows
  run. (3) The user-level settings file is `harness/infra.json` under `HARNESS_CONFIG_DIR`,
  `XDG_CONFIG_HOME`, `APPDATA` or `~/.config`. (4) The template's T-0002 and D-0001 still
  name G-0022 and G-0024; left alone because T-0008 (#13) rewrites those files. (5) The
  runner's job installs Node and pnpm from the internet on each run; a cache could come later.
- 2026-11-20 developer: merged `main` after T-0008 (#13) took 0.5.0. On the coordinator's
  word T-0007 is now 0.6.0 (Goal, Done-when 6 and Notes say so) and T-0004's slice 3 is
  0.7.0 (its slice table, the stubs' message, the `GHCR_PULL_TOKEN` line). G-0026 to G-0029
  say `since: 0.4.0`, a version never tagged, and shipped in v0.5.0: `changes v0.3.0
  v0.4.0` still lists them as Done-when 1 asks, `changes v0.5.0 v0.6.0` rightly doesn't, and
  the README says so (it also corrects main's "From 0.4.0 to 0.5.0" paragraph). The
  template's D-0001 now names G-0028 and its CI workflow's comment G-0029 (T-0002 no longer
  named G-0022 after #13). `pnpm test`: 173 pass, 0 fail. `pnpm run self-test`: "✓
  self-test passed: 27 steps, harness 0.6.0 in a throwaway project"; with `--e2e`: "29
  steps". `pnpm run check`: tasks, global decisions and agents ✓. Live: `harness infra
  init` re-pinned the infrastructure repository to the merge commit through its pull
  request #4; `harness nas --remote core.ping` printed `"pong"`; `harness infra check`
  exited 0 (four secrets ✓, `GHCR_PULL_TOKEN` not there yet, configuration ✓, "pong");
  the runner `online`.
- 2026-11-20 developer: Remaining: after `v0.6.0` is tagged, run `harness infra init` once
  more so the infrastructure repository is pinned to the tag instead of this branch's
  commit (Done-when 2 then shows "nothing changed" on a second run); Done-when 4 from a
  machine off the home network; the tag itself (Done-when 6).
- 2026-11-20 tester: sent back: the generated `project-up.yml` is not valid YAML (its `sync`
  description holds `: `), so every push to the infrastructure repository has a failed run;
  every other check passed (see *Test*). Remaining: the fix and a test that parses every
  generated workflow; then a new test pass, Done-when 4 off the home network, the tag
  `v0.6.0`, and `infra init` re-pinning to it.
- 2026-11-20 developer: fixed what the tester sent back. Every generated description and
  name is quoted (`run-name` too), and so is every `name` and `description` of the four
  reusable `infra-*.yml`. A new test loads every generated caller (three refs and
  environments) and every file in `.github/workflows/`, `template/_github/workflows/` and
  `template-sync/_github/workflows/` with the `yaml` parser (a dev dependency; the package
  keeps `ws` as its one runtime dependency), fails on any error or warning, and reads each
  caller's descriptions and inputs back; it fails on the old generator. `harness sync` now
  also writes the ask rules `Bash(*confirmed=true*)` and `PowerShell(*confirmed=true*)`, and
  `rules/AGENTS.md` says never to start an infrastructure workflow with `gh workflow run`
  directly. `infra check` and `infra runner status` refuse with "only the Engineer may look
  at the infrastructure". `pnpm test`: 190 pass, 0 fail. `pnpm run self-test`: "✓ self-test
  passed: 28 steps, harness 0.6.0 in a throwaway project"; with `--e2e`: 30 steps. `pnpm
  run check`: tasks, global decisions and agents ✓. Live: `harness infra init` regenerated
  the infrastructure repository through its pull request #5; its new main has no failed
  run (only `nas` and `check`, both success); `harness nas --remote core.ping` printed
  `"pong"`; `harness infra check` exited 0; the runner `online`.
- 2026-11-20 developer: Remaining: a new test pass; after `v0.6.0` is tagged, `harness infra
  init` once more to pin the infrastructure repository to the tag; Done-when 4 from a
  machine off the home network; the tag itself (Done-when 6).
- 2026-11-20 tester: passed (second run, see *Test*): the three defects are fixed, the new
  YAML test fails on the old generator, every check and live item holds with no `TRUENAS_*`
  set, and nothing leaked. After the merge the tester tags `v0.6.0` and re-pins the
  infrastructure repository to it.
- 2026-11-20 tester: Remaining: Done-when 4, `harness nas --remote core.ping` from a machine
  off the home network with no `TRUENAS_*` variable, for the Engineer; and recording here
  the tag `v0.6.0` and the re-pin to it (done by the tester right after the merge).
- 2026-11-20 tester: Merged as 312a350 (#15); v0.6.0 tagged there; the infrastructure repository re-pinned to v0.6.0 through its pull request, a second init said "nothing changed (harness v0.6.0)", and a `nas --remote core.ping` through the new pin answered "pong".
- Remaining: Done-when 4, the Engineer runs `harness nas --remote core.ping` from a machine off the home network with no TRUENAS_* variable.
