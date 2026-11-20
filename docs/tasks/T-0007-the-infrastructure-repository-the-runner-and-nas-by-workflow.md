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

Not yet tested.

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
  that fail with "arrives with harness 0.6.0" so the callers are valid now; T-0004 replaces
  them and their inputs. (2) Added `harness infra check` (what `init` offers to start),
  `--harness-ref` on `init`, and the internal `harness infra job nas | check` the workflows
  run. (3) The user-level settings file is `harness/infra.json` under `HARNESS_CONFIG_DIR`,
  `XDG_CONFIG_HOME`, `APPDATA` or `~/.config`. (4) The template's T-0002 and D-0001 still
  name G-0022 and G-0024; left alone because T-0008 (#13) rewrites those files. (5) The
  runner's job installs Node and pnpm from the internet on each run; a cache could come later.
- 2026-11-20 developer: Remaining: after `v0.4.0` is tagged, run `harness infra init` once
  more so the infrastructure repository is pinned to the tag instead of this branch's
  commit (Done-when 2 then shows "nothing changed" on a second run); Done-when 4 from a
  machine off the home network; the tag itself (Done-when 6).
