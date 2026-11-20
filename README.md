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
| [.github/workflows/](.github/workflows/) | reusable `ci.yml` and `auto-merge.yml` |

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
pnpm add -D github:SanderGeraedts/harness#v0.3.0
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
    uses: SanderGeraedts/harness/.github/workflows/ci.yml@v0.3.0
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
    uses: SanderGeraedts/harness/.github/workflows/auto-merge.yml@v0.3.0
    # with:
    #   ci-workflow: ci.yml
    #   backend-workflow: backend.yml
    #   backend-paths: '^(backend/|\.github/workflows/backend\.yml)'
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

Starting a workflow needs the `actions: write` permission in the caller, and the started
workflow needs a `workflow_dispatch:` trigger. When CI can't be started the merge still
stands, and the run shows a warning that says what is missing.

Once CI has run, protect the default branch. Agents do this themselves (G-0025). The check
name is the caller's job name, then the reusable workflow's:

```sh
pnpm exec harness protect "checks / checks"
gh api repos/{owner}/{repo}/rules/branches/main
```

The auto-merge workflow still merges under the ruleset: it merges through the API, and only
when the checks passed.

## Adopt, in a repository that already has registries

```sh
pnpm add -D github:SanderGeraedts/harness#v0.3.0
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

`harness create` spins up a new project (G-0024): the app from [template/](template/), the
harness installed and initialised, CI and auto-merge wired, the first decisions and tasks
recorded, and a GitHub repository with a protected default branch.

```sh
pnpm exec harness create my-project \
  --purpose "What the project is for, in a sentence." \
  --accent "#2f6fed" --font system --language en
```

In a terminal it asks for the purpose, the look and the language that weren't given as
flags; elsewhere the flags are all there is, and only `--purpose` is required.

| Option | What |
| --- | --- |
| `--dir <path>` | where to create it; default `./<name>` |
| `--title <text>` | the name people see; default made from the name (`my-project` gives "My project") |
| `--purpose <text>` | what the project is for; recorded as its first decision |
| `--accent <#rrggbb>` | the accent colour; default `#2f6fed`. The text colour on it is worked out for contrast |
| `--font <name>` | `system`, `serif`, `rounded` or `mono`: font stacks that need no font files; default `system` |
| `--language <code>` | the interface language, such as `en` or `nl`; default `en` |
| `--engineer <login>` | a GitHub login of an Engineer of the new project; repeat for more |
| `--private`, `--public` | the repository's visibility; default private |
| `--no-github` | stop after the first local commit |
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

1. Copies the template and fills in the name, title, purpose, look and language.
2. Installs the dependencies and the harness, then runs `harness init` with the Engineers
   and `harness sync`.
3. Records the first decisions (`D-0001` purpose, `D-0002` local-first and ready to sync,
   `D-0003` look, `D-0004` language, `D-0005` slug addresses) and the first tasks, and runs
   `harness check`.
4. Makes the first commit on `main`. With `--no-github` it stops here.
5. Creates the repository under the signed-in account and pushes. This is the one push to
   the default branch a project ever gets: the first commit of an empty repository, before
   a ruleset can exist (G-0025). The project's own pre-push hook is not used for it.
6. Waits for the first CI run and, when it is green, runs `harness protect "checks / checks"`.

The push carries workflow files, so `gh`'s token needs the `workflow` scope
(`gh auth refresh -s workflow`), unless git is set up to push to GitHub another way (a
`url.<base>.insteadOf` rule for `https://github.com/`). The command checks this, and that
no repository of that name exists, before it writes anything. If a run stops after creating
the repository, remove the local folder and run it again: an empty repository of that name
with the same visibility is used instead of refused.

GitHub offers rulesets on public repositories, and on private ones only on a paid plan.
Where it refuses, the project is still created and its CI runs, and the command ends with a
`Remaining:` line: the default branch is not protected until `harness protect` succeeds.

The app it creates is local-first and ready to sync: Dexie with `updatedAt`, tombstones and
an outbox, one write API, slug addresses, seeded demo data outside production, and no
backend. Hosting, the backend and sync are not created yet.

The template is tested with the harness: `pnpm run self-test` creates a project from it and
runs its type-check, unit tests and build; CI also runs its end-to-end tests
(`node scripts/self-test.mjs --e2e`). After changing `template/package.json`, run
`node scripts/template-lock.mjs` to refresh the lockfile new projects start from.

## Update

```sh
pnpm add -D github:SanderGeraedts/harness#v0.3.0
pnpm exec harness sync
pnpm exec harness changes v0.2.0 v0.3.0
```

Bump the tag in both workflows in the same pull request, and put the output of `changes` in
its description: the global decisions that were added, changed or replaced. Per decision the
project's architect opens a task to conform or records an overruling decision.

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
| `sync` | writes or refreshes the generated files: `.claude/agents/*.md`, `.githooks/pre-push`, the push and `--confirmed` rules in `.claude/settings.json` (merged into the project's own), the registry README (keeping its project section) and the templates |
| `init [login...] [--default-branch <name>]` | sets an existing repository up, then runs `sync` |
| `adopt [--write] [login...] [--default-branch <name>]` | for a repository that already has registries: reports what is there, what would be added, which generated files differ, and which project decisions look like a global one; changes nothing. With `--write` it adds what is missing and overwrites nothing |
| `hooks` | points git at `.githooks`; the project's `prepare` script |
| `protect <check>... [--repo owner/name] [--dry-run]` | creates or updates the ruleset on the default branch through `gh api`: a pull request with 0 approvals, the named checks required (as reported by GitHub Actions), no deletion, no force-push, no bypass actors. Found again by its name, so it is safe to repeat |
| `nas <method> [params-json] [--job] [--confirmed]` | calls the TrueNAS API; see below |
| `create <name> [options]` | spins up a new project from the template, for the Engineer only; see *Create a new project* |

## The NAS tool

`harness nas` calls the TrueNAS API over the LAN as the agents' own admin user. It reads
`TRUENAS_HOST`, `TRUENAS_API_KEY` and `TRUENAS_CERT_SHA256` from the environment, which
exist only on the Engineer's machine, and sends the key only after the NAS's certificate
matches the pinned fingerprint.

```sh
pnpm exec harness nas --fingerprint          # print the certificate's fingerprint, to pin it
pnpm exec harness nas system.info
pnpm exec harness nas app.redeploy '["<app>"]' --job
pnpm exec harness nas pool.snapshot.create '[{"dataset":"<dataset>","name":"before-<change>"}]'
```

Destructive methods (deleting or overwriting data, datasets, disks and apps; rolling back,
deleting or cloning snapshots; users, keys, certificates, sign-in and network; reboot,
shutdown and OS updates) refuse to run without `--confirmed`, and Claude Code asks a human
before any command that carries it. Creating a snapshot is not destructive.

One-time setup, by the Engineer: create a TrueNAS user for the agents with full admin, no
password and no SSH; give it an API key; run `--fingerprint` and compare the result with the
certificate the TrueNAS UI shows; store the host, the key and the fingerprint as user
environment variables. To revoke, delete the key in the TrueNAS UI.

## Working on the harness

See [AGENTS.md](AGENTS.md). `pnpm test` runs the unit tests; `pnpm run self-test` packs the
harness, installs it into a throwaway project and runs its commands there.

## Licence

MIT.
