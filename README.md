# harness

An AI-first way of working that projects install: a registry of global decisions, rules for
agents, a team of four agents, scripts, and reusable GitHub workflows for CI and auto-merge.

Agents write the code. They work from recorded decisions and from tasks with a check, every
change goes through a pull request, and a green pull request that a tester has passed merges
itself. Humans decide what can't be undone or costs money.

## What is in it

| Folder | What |
| --- | --- |
| [decisions/](decisions/index.md) | the global decisions (`G-NNNN`) that hold in every project, unless the project overrules one |
| [rules/AGENTS.md](rules/AGENTS.md) | the rules every agent reads in a project |
| [agents/](agents/) | the team: architect, UX designer, developer, tester (Claude Code subagents) |
| [templates/](templates/) | decision, question, task and lessons templates, and a project's thin `AGENTS.md` and `CLAUDE.md` |
| `bin/`, `lib/` | the `harness` command |
| [template/](template/) | the app a new project starts from, for `harness create` |
| [template-sync/](template-sync/) | what a project that syncs gets on top of it: a backend, a sign-in and the sync engine |
| [.github/workflows/](.github/workflows/) | reusable `ci.yml`, `auto-merge.yml` and `backend.yml` for projects, and `infra-nas.yml` and `infra-check.yml` for the private infrastructure repository |

## Roles

- **Engineer:** makes the architectural decisions that need a human. Listed by GitHub login
  in the project's `.harness/engineers`.
- **Requester:** anyone else. Asks the team for changes in plain language, and is never
  asked engineering questions.

`harness role` prints which one the signed-in GitHub account is.

## The team

Every task goes through a pipeline, and each role writes its result in the task file:

1. **Architect:** turns the request into a task with a check, names the decisions it
   follows, records new decisions, raises questions for the Engineer.
2. **UX designer:** designs anything a user sees before it is built, and reviews it after.
3. **Developer:** builds it in a draft pull request.
4. **Tester:** runs the check independently, tries to break it, and only then marks the pull
   request ready. Drafts never merge, so nothing merges untested.

## Install in a project

The project is an existing git repository with a `package.json`, using pnpm.

```sh
pnpm add -D github:SanderGeraedts/harness#v0.7.0
pnpm exec harness init <engineer-github-login>...
pnpm exec harness check
```

In a repository that already has decisions, tasks, a hook or agent files of its own, run
`pnpm exec harness adopt` instead of `init`: see [Adopt](#adopt-in-a-repository-that-already-has-registries).

`init` creates the registries (`docs/decisions/`, `docs/tasks/`), `.harness/engineers`,
`docs/lessons.md`, a thin `AGENTS.md` and `CLAUDE.md` that point into
`node_modules/@sandergeraedts/harness/`, an `.nvmrc`, and the `preinstall` (pnpm only) and
`prepare` (git hooks) scripts. It never overwrites a file the project already has: in a
project with its own `AGENTS.md`, add the pointers from
[templates/AGENTS.md](templates/AGENTS.md) by hand. Then it runs `sync`, which does replace
the files the harness generates (`harness adopt` shows which of those the project already
has). Pass `--default-branch <name>` when the default branch isn't `main`.

Add two workflows, pinned to the same tag as the dependency.

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    uses: SanderGeraedts/harness/.github/workflows/ci.yml@v0.7.0
    # with:
    #   checks: |
    #     pnpm run typecheck
    #     pnpm test
    #     pnpm run build
    #   e2e: pnpm run test:e2e
    #   artifacts: |
    #     playwright-report/
    #     test-results/
    #   artifact-name: e2e-report
    #   artifacts-only-on-failure: true
```

The workflow needs `workflow_dispatch:`. A merge made with `GITHUB_TOKEN` starts no push
workflows, so the auto-merge workflow starts CI on the default branch itself after it
merges, and that is the trigger it uses.

`.github/workflows/auto-merge.yml`:

```yaml
name: Auto-merge

on:
  workflow_run:
    workflows: [CI]
    types: [completed]

permissions:
  contents: write
  pull-requests: write
  actions: write

jobs:
  merge:
    uses: SanderGeraedts/harness/.github/workflows/auto-merge.yml@v0.7.0
    # with:
    #   ci-workflow: ci.yml
    #   backend-workflow: backend.yml
    #   backend-paths: '^(backend/|\.github/workflows/backend\.yml)'
    #   wait-for: CI,Backend      # and workflows: [CI, Backend] above
```

The CI workflow installs with pnpm, runs `harness check`, then the project's own checks. A
project may add jobs of its own next to `checks`; the pull request merges when the whole
workflow is green. Its inputs, all optional:

| Input | Default | What |
| --- | --- | --- |
| `node-version-file` | `.nvmrc` | the file that names the Node version |
| `checks` | the `typecheck`, `test` and `build` scripts that exist | the project's checks, as a shell script |
| `e2e` | none | the end-to-end test command; Playwright's Chromium is installed first |
| `artifacts` | none | paths to upload as an artifact, one per line |
| `artifact-name` | `ci-artifacts` | the name of that artifact |
| `artifacts-only-on-failure` | `false` | `true` uploads only when a step failed, instead of on every run |

The auto-merge workflow merges a green pull request into the default branch when it isn't a
draft, and then starts CI on the default branch. Its inputs, all optional:

| Input | Default | What |
| --- | --- | --- |
| `ci-workflow` | `ci.yml` | the file name of the project's CI workflow, started on the default branch after a merge; empty starts nothing |
| `backend-workflow`, `backend-paths` | none | a workflow file to start after merging a pull request that touched paths matching the regular expression, e.g. the backend's publish |
| `hold-paths` | none | a regular expression; a pull request that touches a matching path is labelled as waiting for the Engineer instead of merged |
| `hold-label` | `waits-for-engineer` | the label a held pull request gets |
| `wait-for` | none | other workflows, by name and comma-separated, that must pass when they ran for the pull request's head, e.g. `CI,Backend`. List them under `workflow_run` too: the merge is decided again when each completes, waits while one still runs, and never happens when one failed. A workflow that didn't run for the pull request isn't waited for |

Starting a workflow needs the `actions: write` permission in the caller, and the started
workflow needs a `workflow_dispatch:` trigger. When CI can't be started the merge still
stands, and the run shows a warning that says what is missing.

A project that syncs has a third workflow, `.github/workflows/backend.yml`, which `harness
create --sync` writes. It calls the reusable backend workflow:

```yaml
name: Backend

on:
  pull_request:
    paths: ["backend/**", ".github/workflows/backend.yml"]
  push:
    branches: [main]
    paths: ["backend/**", ".github/workflows/backend.yml"]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  image:
    permissions:
      contents: read
      packages: write
    uses: SanderGeraedts/harness/.github/workflows/backend.yml@v0.7.0
```

Publishing is a job of its own: the only one that takes `packages: write`, and it runs on
the default branch alone, after the job that builds and tests. That job, which also runs for
pull requests, only reads, and its checkout keeps no token.

It builds the image from the project's `backend/` folder, starts it on an empty database
(`backend/throwaway.sh`), runs `backend/smoke-test.sh` and the project's backend tests
against it, and, on the default branch only, publishes it as
`ghcr.io/<owner>/<repository>-backend`, tagged `:stable` and `:sha-<commit>`. The auto-merge
workflow starts it after merging a backend change (`backend-workflow`, `backend-paths`),
which is why it needs `workflow_dispatch:`. Its inputs, all optional:

| Input | Default | What |
| --- | --- | --- |
| `node-version-file` | `.nvmrc` | the file that names the Node version |
| `tests` | `pnpm run test:backend` | the project's tests against the throwaway backend, as a shell script; they get its address in `BACKEND_TEST_URL` |
| `publish` | `true` | `false` never publishes the image |
| `setup`, `project-directory` | none, `.` | only the harness itself uses these, to test the template |

Once CI has run, protect the default branch. Agents do this themselves wherever GitHub allows a ruleset (G-0029). The check
name is the caller's job name, then the reusable workflow's:

```sh
pnpm exec harness protect "checks / checks"
gh api repos/{owner}/{repo}/rules/branches/main
```

The auto-merge workflow still merges under the ruleset: it merges through the API, and only
when the checks passed.

## Adopt, in a repository that already has registries

```sh
pnpm add -D github:SanderGeraedts/harness#v0.7.0
pnpm exec harness adopt
pnpm exec harness adopt --write <engineer-github-login>...
pnpm exec harness sync
pnpm exec harness check
```

`adopt` on its own only reports, and changes nothing:

- **Found:** how many decisions, questions and tasks are there.
- **Kept:** the project's own files (`AGENTS.md`, the decision index and so on), with what
  to add to them by hand.
- **Would add:** every file that is missing.
- **Differs:** files the harness generates that exist here with other content, such as
  `docs/decisions/README.md` or `.githooks/pre-push`.
- **What `harness check` will report** about the records that are there.
- **Candidates:** the Accepted project decisions that look like a global decision.

`adopt --write` adds what is missing and never overwrites a file. The files that differ stay
as they are until the project has moved what it wants to keep and runs `harness sync`, which
replaces them; until then `harness check` names them. Text of the project's own about its
registry goes in the README's project section (see below).

A candidate is a guess from shared words, for the architect to read. The words of a
decision's title and description are lower-cased, without words shorter than three letters,
a short list of stop words and a final "s". A project decision is listed with a global one
when their titles share at least two words, or titles and descriptions together at least
three. Its matches are listed best first (words shared by both titles count twice), at most
three, without any that score under two thirds of the best. Only Accepted records are
compared, and a global decision the project already overrules is never listed with it. For each
candidate, either the global decision covers it (set the project decision to `Replaced` with
`replaced_by: [G-NNNN]`), or the project differs on purpose (keep it, with
`overrules: [G-NNNN]`).

## What a project may change in its registry

- **`replaced_by` may name a global decision.** A project decision that a global one makes
  redundant gets `status: Replaced` and `replaced_by: [G-NNNN]`; `harness check` fails when
  that id isn't in the installed harness. Its line moves to *Replaced* in the project's
  index and ends with `Replaced by G-NNNN.` in plain text: the index links only to the
  records in its own folder. `replaces` only names project decisions; a project decision
  that sets a global one aside uses `overrules`.
- **The registry README has a project section.** `docs/decisions/README.md` is generated,
  except for what is between the two marker lines under *Project notes*:

  ```markdown
  <!-- harness:project-section:start -->
  The project's own text.
  <!-- harness:project-section:end -->
  ```

  `harness sync` keeps that text and `harness check` ignores it. Keep both marker lines:
  when one is missing or repeated, `sync` and `check` stop with an error instead of guessing.

## Create a new project

`harness create` spins up a new project (G-0028): the app from [template/](template/), the
harness installed and initialised, CI and auto-merge wired, the first decisions and tasks
recorded, and a GitHub repository with a protected default branch.

```sh
pnpm exec harness create my-project \
  --purpose "What the project is for, in a sentence." \
  --accent "#2f6fed" --font system --language en
```

Run inside a git repository, as here, it puts the new project next to that repository
(`../my-project`, seen from its root) and never inside it. `--dir` says where else.

In a terminal it asks for the purpose, the look, the language and whether the app syncs
("Sync between devices? [yes]") when they weren't given as flags; elsewhere the flags are
all there is, and only `--purpose` is required.

| Option | What |
| --- | --- |
| `--dir <path>` | where to create it. Default: `./<name>`, or, when run inside a git repository, `<name>` next to that repository's root |
| `--title <text>` | the name people see; default made from the name (`my-project` gives "My project") |
| `--purpose <text>` | what the project is for; recorded as its first decision |
| `--accent <#rrggbb>` | the accent colour; default `#2f6fed`. The text colour on it is worked out for contrast |
| `--font <name>` | `system`, `serif`, `rounded` or `mono`: font stacks that need no font files; default `system` |
| `--language <code>` | the interface language, such as `en` or `nl`; default `en` |
| `--sync`, `--no-sync` | whether the app syncs between devices (G-0020); default `--sync`. See *With and without sync* |
| `--engineer <login>` | a GitHub login of an Engineer of the new project; repeat for more |
| `--private`, `--public` | the repository's visibility; default private |
| `--git-name <name>`, `--git-email <address>` | the author of the first commit, also set as the new repository's own `user.name` and `user.email`. Default: whatever git is configured with on this machine |
| `--no-github` | stop after the first local commit |
| `--no-infra` | don't spin up the site and the backend; run `harness infra up <name>` later |
| `--harness-ref <ref>` | the harness tag, branch or commit to install and to pin the workflows to; default the tag of the harness that runs the command |
| `--harness-package <spec>` | install the harness from this package spec instead; for tests |

**Only the Engineer creates a project.** `.harness/engineers` belongs to a project, so the
rule is:

- run from inside a project that has the harness, the signed-in GitHub account (`gh`) must
  be in that project's `.harness/engineers`, and the new project gets the same Engineers,
  plus any `--engineer`;
- run anywhere else, `--engineer` is required and the signed-in account must be one of the
  logins given.

What it does, in order:

1. Copies the template, and for a project that syncs the overlay over it, and fills in the
   name, title, purpose, look and language.
2. Installs the dependencies and the harness, then runs `harness init` with the Engineers
   and `harness sync`.
3. Records the first decisions (`D-0001` purpose, `D-0002` local-first, with or without
   sync, `D-0003` look, `D-0004` language, `D-0005` slug addresses, and for a project that
   syncs `D-0006` to `D-0010`) and the first tasks, and runs `harness check`.
4. Makes the first commit on `main`. With `--no-github` it stops here. A run that fails
   before this point removes what it put in the folder, so the same command can be run
   again.
5. Creates the repository under the signed-in account and pushes. This is the one push to
   the default branch a project ever gets: the first commit of an empty repository, before
   a ruleset can exist (G-0029). The project's own pre-push hook is not used for it.
6. Waits for the first CI run and, when it is green, runs `harness protect "checks / checks"`.
7. Unless `--no-infra`: for a project that syncs, waits for the first `backend` run on
   `main`, which publishes the image; then runs `harness infra up <name>` (see *Spin-up and
   teardown*) and ends with `Done.` and the site's address. Before step 1 it checks that the
   infrastructure is ready: the infrastructure repository is set, its environment has the
   four secrets, and for a project that syncs the runner on the NAS is online. Otherwise it
   stops before writing anything and says which one-time step is missing.

The push carries workflow files, so `gh`'s token needs the `workflow` scope
(`gh auth refresh -s workflow`), unless git is set up to push to GitHub another way (a
`url.<base>.insteadOf` rule for `https://github.com/`). The command checks this, and that
no repository of that name exists, before it writes anything. If a run stops after creating
the repository, remove the local folder and run it again: an empty repository of that name
with the same visibility is used instead of refused.

The first commit carries a name and an e-mail address, and the push sends them to GitHub.
Without `--git-name` and `--git-email` they are the machine's git defaults; give the flags
when those are not the ones the new repository should show.

GitHub offers rulesets on public repositories, and on private ones only on a paid plan
(G-0029). A new repository is private, so on a free plan it ends with one calm `Remaining:`
line: the default branch gets its ruleset when the Engineer makes the repository public, and
then `harness protect "checks / checks"` is run in it. Until then the pre-push hook, the deny
rules and the draft gate protect it. Where GitHub refuses the ruleset on a public repository,
the line says the branch is NOT protected and why.

### With and without sync

Either way the app is local-first: Dexie with `updatedAt`, tombstones and an outbox, one
write API, slug addresses, and seeded demo data outside production.

**With `--sync`** (the default) the project also gets, from [template-sync/](template-sync/):

- `backend/`: a PocketBase image with the schema and hooks baked in, a smoke test, a script
  that starts a throwaway backend for tests, and `funnel.json`, the paths the internet may
  reach;
- the `backend` workflow, and the auto-merge caller that starts it after a backend change;
- a sign-in screen, an account screen and a session, in `src/auth/`;
- the sync engine, in `src/sync/`, and a sync status under the header.

Sync, and with it the sign-in, exists only in a production build that was given the
backend's address (`BACKEND_URL`, G-0019). Every other build runs on demo data, shows no
sign-in and holds neither the address nor the backend's client. What the template decides
as a starting point is recorded in the new project as its own decisions, which it can
replace: only a signed-in account reads and writes, and only its own records, with sign-up
closed (`D-0006`); the newest change to a record wins, and a delete is a tombstone
(`D-0007`); the backend changes only by migrations, and nothing about where it runs is in
the repository (`D-0008`); only the user's own sign-out clears the device (`D-0009`); and
after a sign-in ended only the same account signs in again (`D-0010`).

**With `--no-sync`** the data stays on one device: no `backend/`, no `src/auth/`, no backend
workflow and no backend client among the dependencies.

For both, the content security policy is not in `netlify.toml`: the build writes it to
`dist/_headers`, so that a production build can add the backend's origin without the address
being in the repository.

Hosting and a running backend are not created yet: a project that syncs publishes its
backend image, and its first tasks say what remains.

The template is tested with the harness: `pnpm run self-test` creates a project of each kind
and runs its type-check, unit tests and build; CI also runs their end-to-end tests
(`node scripts/self-test.mjs --e2e`), and builds the backend image and runs its smoke test
and the app's backend tests through the reusable backend workflow. After changing
`template/package.json` or `template-sync/package.json`, run `node scripts/template-lock.mjs`
to refresh the lockfiles new projects start from. `node scripts/make-project.mjs <dir>
[--no-sync]` creates a project from the checkout to try by hand.

## Update

```sh
pnpm add -D github:SanderGeraedts/harness#v0.7.0
pnpm exec harness sync
pnpm exec harness changes v0.6.0 v0.7.0
```

Bump the tag in both workflows in the same pull request, and put the output of `changes` in
its description: the global decisions that were added, changed or replaced. Per decision the
project's architect opens a task to conform or records an overruling decision.

From 0.6.0 to 0.7.0, also in that pull request:

- A project that syncs: in `.github/workflows/auto-merge.yml`, set `workflows: [CI,
  Backend]` and add `wait-for: CI,Backend` under `with:`, so a pull request whose `Backend`
  run failed no longer merges. A new project gets this from the template.
- `sync` adds two ask rules to `.claude/settings.json` for each of Bash and PowerShell:
  `*project-down*` and `*confirmation=*`, so a teardown workflow started by hand asks a
  human just as `harness infra down --confirmed` does. Commit what it writes.
- Nothing else changes for callers of `ci.yml`, `auto-merge.yml` and `backend.yml`.
- The Engineer runs `harness infra init` once more: `project-up.yml` gains the input
  `private` and `project-down.yml` the input `repository`, and both callers now do the work.
  New are `harness infra up` and `harness infra down`, and `create` ends by spinning up the
  site and the backend (`--no-infra` to leave that out). G-0030 adds the secret
  `GHCR_PULL_TOKEN`, needed for a private project's backend.

From 0.5.0 to 0.6.0, also in that pull request:

- `sync` rewrites the agents in `.claude/agents/` (each gains the rule that no agent reads,
  prints or carries a secret), and adds two ask rules to `.claude/settings.json`:
  `Bash(*confirmed=true*)` and `PowerShell(*confirmed=true*)`, so a workflow started by hand
  with `confirmed=true` asks a human just as `--confirmed` does. Commit what it writes.
- `rules/AGENTS.md` follows G-0026 to G-0029: secrets in a GitHub environment of the
  private infrastructure repository, the NAS through `harness nas --remote`, spin-up in two
  places, and new repositories private, with a ruleset once public.
- `harness nas` says G-0027 where it said G-0022, and `create` G-0028 and G-0029.
- Nothing changes for callers of `ci.yml`, `auto-merge.yml` and `backend.yml`.
- `changes v0.5.0 v0.6.0` doesn't list G-0026 to G-0029: those records came with 0.5.0
  (their `since` says 0.4.0, a version that was never tagged), and 0.6.0 is where the rules
  and commands follow them. From 0.3.0, `changes v0.3.0 v0.6.0` lists them.

From 0.3.0 to 0.5.0 (0.4.0 was never tagged) nothing changes in how a project that exists
works: `sync` writes what it wrote before and the two reusable workflows are as they were.
The global registry gained G-0026 to G-0029, which replace G-0022, G-0024 and G-0025; the
rules follow them from 0.6.0. New are `harness create --sync | --no-sync` and the reusable
`backend.yml`. An existing project doesn't gain sync by updating; `src/sync/README.md` in a
project without it says what adding it takes.

From 0.1.0 to 0.2.0, also in that pull request:

- Add `workflow_dispatch:` to the `on:` of the CI workflow, and make sure the auto-merge
  workflow grants `actions: write`. From then on a merge is followed by a CI run on the
  default branch. A CI workflow file that isn't `ci.yml` is named with `ci-workflow`.
- `sync` rewrites `docs/decisions/README.md` (it gains the project section) and the decision
  template. Commit what it writes.
- Nothing else changes for callers: the new workflow inputs are optional and their defaults
  behave as 0.1.0 did. No global decision was added, changed or replaced.

`changes` reads the installed copy (each global decision carries the version that added it
in `since` and the version that replaced or redacted it in `changed`), so run it after
installing the new version.

## Commands

Run from the project root with `pnpm exec harness <command>`.

| Command | What it does |
| --- | --- |
| `role` | prints `engineer` or `requester`: is the signed-in GitHub account (`gh api user`) in `.harness/engineers`? `requester` when the file or `gh` is missing |
| `check` | what CI checks: the task index is in step, the decision index lists every record and nothing else, front matter is valid, every `overrules` and every `replaced_by` with a `G-NNNN` id names a global decision of the installed harness, the Engineers are listed, and the generated files are current (the registry README's project section aside) |
| `tasks-index [--check] [dir]` | writes `docs/tasks/index.md` from the task files, or checks it |
| `overrules` | lists the project decisions that overrule global ones |
| `changes <fromTag> [toTag]` | lists the global decisions added, changed or replaced after `fromTag`, up to `toTag` (default: the installed version) |
| `waiting [dir...]` | lists what waits on a human, for one or several project folders: open questions, tasks' `Remaining:` lines, and open GitHub issues that are assigned. Skips issues when `gh` is missing |
| `sync` | writes or refreshes the generated files: `.claude/agents/*.md`, `.githooks/pre-push`, the push rules and the `--confirmed`, `confirmed=true`, `project-down` and `confirmation=` ask rules in `.claude/settings.json` (merged into the project's own), the registry README (keeping its project section) and the templates |
| `init [login...] [--default-branch <name>]` | sets an existing repository up, then runs `sync` |
| `adopt [--write] [login...] [--default-branch <name>]` | for a repository that already has registries: reports what is there, what would be added, which generated files differ, and which project decisions look like a global one; changes nothing. With `--write` it adds what is missing and overwrites nothing |
| `hooks` | points git at `.githooks`; the project's `prepare` script |
| `protect <check>... [--repo owner/name] [--dry-run]` | creates or updates the ruleset on the default branch through `gh api`: a pull request with 0 approvals, the named checks required (as reported by GitHub Actions), no deletion, no force-push, no bypass actors. Found again by its name, so it is safe to repeat |
| `nas [--remote] <method> [params-json] [--job] [--confirmed]` | calls the TrueNAS API; `--remote` through the workflow on the runner on the NAS. See *The NAS tool* |
| `infra init \| check \| runner install \| runner status` | the private infrastructure repository and the runner on the NAS, for the Engineer only; see *The infrastructure repository* |
| `infra up <project> \| down <project> [--confirmed]` | spin a project's site and backend up, or remove them, for the Engineer only; see *Spin-up and teardown* |
| `create <name> [options]` | spins up a new project from the template, for the Engineer only; see *Create a new project* |

## The infrastructure repository

The secrets the infrastructure needs (the Netlify token, the Tailscale OAuth client, the
TrueNAS key) are held by a GitHub environment of the Engineer's **private infrastructure
repository**, and infrastructure work runs there as workflows (G-0026). No machine holds
them, and no agent reads, prints or carries one. Which repository it is, is a setting, never
written into the harness or a project:

| Setting | Where | Default |
| --- | --- | --- |
| the repository, as `owner/name` | `HARNESS_INFRA_REPO`, or the user-level file `harness infra init --repo` writes (`harness/infra.json` in `XDG_CONFIG_HOME`, `APPDATA` or `~/.config`) | none: the commands stop and say how to set it |
| the environment's name | `HARNESS_INFRA_ENVIRONMENT`, or `--environment` | `Prod` |

Only the Engineer runs `harness infra` and `harness nas --remote`: inside a project the
signed-in `gh` account must be in `.harness/engineers`, and anywhere it must have admin rights
on the repository, which must be private.

```sh
pnpm exec harness infra init --repo <owner>/<name>   # once; remembered on this machine
pnpm exec harness infra runner install               # once, at home: see below
pnpm exec harness infra runner status                # online?
pnpm exec harness infra check                        # proves the whole chain
```

- **`infra init`** creates the repository, private, when it doesn't exist (it never changes
  an existing one's visibility). It writes the generated files: into an empty repository as
  its first commit, otherwise through a pull request that it merges when it holds generated
  files only. Run again, it says nothing changed. Then it checks, by name only, that the
  environment has `NETLIFY_AUTH_TOKEN`, `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` and
  `TRUENAS_API_KEY`, and says whether `GHCR_PULL_TOKEN` is there yet; a missing one is a
  `Remaining:` line for the Engineer. `--dir <folder>` only writes the files into a folder.
  `--harness-ref` pins another tag or commit than the running harness's.
- **The generated files:** four thin callers, each `on: workflow_dispatch`, that call the
  harness's reusable workflows at the pinned tag with `secrets: inherit` and the
  environment's name (`nas.yml`, `check.yml`, `project-up.yml` and `project-down.yml`),
  and a README. Nothing in them names a host, an address, a dataset or a token.
- **The runner:** a self-hosted GitHub Actions runner, the official image at a pinned
  version, as a custom app on the NAS, registered to the repository only and labelled
  `harness-nas` (G-0027). Its own dataset under the parent dataset for apps keeps its
  registration; it gets no container socket and no other dataset. Its app configuration
  holds the NAS's address, the certificate's fingerprint and the parent dataset, for the jobs
  that run on it.
- **`infra runner install`** runs once, at home, with `TRUENAS_HOST`, `TRUENAS_API_KEY`,
  `TRUENAS_CERT_SHA256` and `TRUENAS_APPS_DATASET` in the Engineer's environment: it creates
  the dataset, gets a registration token from `gh` (valid for an hour) and creates the app
  with it. The token goes from `gh` to the NAS inside the process, never to the output, a
  file or a command line, and once the runner is online the app is updated without it. Run
  again, it changes nothing.
- **`infra runner status`** prints `harness-nas: online` (or `offline`), from any machine.
- **`infra check`** starts `check.yml` and prints what it found: each secret by name, the
  runner's configuration, and the NAS answering `core.ping` with the key from the
  environment.

The reusable workflows, `infra-nas.yml` and `infra-check.yml`, run one job on
`[self-hosted, harness-nas]` in the environment they are given, check out the harness at the
tag given, and run one `harness` command. One NAS job runs at a time.

## Spin-up and teardown

`harness infra up <project>` puts a project online (G-0028), from any machine, the Engineer
only. `create` runs it as its last step; run it again by hand to finish what a human step
held up, or to repair. Every step first looks for what is there and says "already there".

```sh
pnpm exec harness infra up my-project                 # the repository is <you>/my-project
pnpm exec harness infra up my-project --repo owner/name --netlify-installation 12345
pnpm exec harness infra down my-project               # lists what would go; exits 2
pnpm exec harness infra down my-project --confirmed   # after the Engineer's yes in chat
```

It reads `backend/funnel.json` from the repository's default branch (a project without it
has no backend), refuses a list with anything but paths under `/api/`, or one that opens
`/api/` whole, the admin screen or the superusers, and checks the environment's secrets and
the runner. Then it starts `project-up.yml` and prints what each job did:

| Job | Runs on | Does |
| --- | --- | --- |
| `site` | GitHub's runner | finds or creates the Netlify site, named after the project (with a short suffix when Netlify has the name), marked with the site variable `HARNESS_REPOSITORY`, and links it to the repository through Netlify's GitHub App, with deploy previews |
| `address` | GitHub's runner | joins the tailnet for a moment as a node tagged `tag:harness`, checks that MagicDNS, HTTPS certificates and Funnel are on for that tag, and works out the backend's address |
| `backend` | the runner on the NAS | the dataset `<parent>/<project>` marked `harness:project=<project>`, with `pb_data` and `tailscale`; the snapshot task (every hour, kept two weeks, G-0023) and a first snapshot; for a private repository the pull token (G-0030); the app: a Tailscale sidecar with Funnel on the allowed paths only and the admin screen on port 8443 for the tailnet, PocketBase at `ghcr.io/<owner>/<project>-backend:stable` with CORS for the site only, and Watchtower for that one container. A one-use auth key for the first start, then the app is updated without it |
| `checks` | GitHub's runner | from outside the tailnet: `/api/health` is 200, the admin screen and the superuser sign-in are 404, the admin port doesn't answer, CORS answers the site's origin and no other. Then `BACKEND_URL` for the production context only (G-0019), a production build, and the site: it serves the app, its headers let it reach the backend, and its bundle holds the address |

The output names the site's address and no other. A step a human must take (the secret
`GHCR_PULL_TOKEN`, Funnel for `tag:harness` in the tailnet policy, Netlify's GitHub App) ends
the run with a `Remaining:` line that says what to do; run `infra up` again after it. The
Netlify app's installation is read from a site of the account that is already linked
through it, or given with `--netlify-installation` (or `netlifyInstallation` in the settings
file). A new backend has no superuser and no user: the Engineer makes them, from a device on
the tailnet.

`harness infra down <project>` lists what it would delete and exits 2. With `--confirmed`,
after the Engineer's yes in chat (G-0027), it starts `project-down.yml`, which first refuses
when a dataset or app of that name exists that spin-up didn't make, then deletes the site
(only when it carries the mark and builds from that repository), the app, the snapshot task
and the dataset with every snapshot of it. It ends with what only the Engineer can remove:
the machine in the tailnet's admin console, the repository and its container image.

## The NAS tool

`harness nas` calls the TrueNAS API (G-0027). Normally it runs through the private
infrastructure repository, from any machine, with no key on it:

```sh
pnpm exec harness nas --remote core.ping
pnpm exec harness nas --remote app.query '[[["name","=","<app>"]]]'
pnpm exec harness nas --remote app.redeploy '["<app>"]' --job
pnpm exec harness nas --remote pool.snapshot.create '[{"dataset":"<dataset>","name":"before-<change>"}]'
```

`--remote` starts `nas.yml` with the method, its parameters and whether it was confirmed,
finds its run by a request id in the run's name, waits, and prints what the run recorded.
That output may name a dataset or a host: it is for the session, never for a file. When the
runner is offline, a run that waits for it is cancelled rather than left to run later.

Without `--remote` it runs on this machine, on the home network, with `TRUENAS_HOST`,
`TRUENAS_API_KEY` and `TRUENAS_CERT_SHA256` from the environment:

```sh
pnpm exec harness nas --fingerprint          # print the certificate's fingerprint, to pin it
pnpm exec harness nas system.info
```

Either way the key is sent only after the NAS's certificate matches the pinned fingerprint.

Destructive methods (deleting or overwriting data, datasets, disks and apps; rolling back,
deleting or cloning snapshots; users, keys, certificates, sign-in and network; reboot,
shutdown and OS updates) refuse to run without `--confirmed`, also with `--remote` and before
any workflow is started, and Claude Code asks a human before any command that carries it.
Creating a snapshot is not destructive.

One-time setup, by the Engineer: create a TrueNAS user for the agents with full admin, no
password and no SSH; give it an API key, and store it as `TRUENAS_API_KEY` in the
infrastructure repository's environment; run `--fingerprint` at home and compare the result
with the certificate the TrueNAS UI shows. To revoke, delete the key in the TrueNAS UI.

## Working on the harness

See [AGENTS.md](AGENTS.md). `pnpm test` runs the unit tests; `pnpm run self-test` packs the
harness, installs it into a throwaway project and runs its commands there.

## Licence

MIT.
