---
id: T-0004
title: "Spin up hosting and the backend, with automatic snapshots"
description: "harness create also starts workflows in the private infrastructure repository that create the Netlify site and, for a project that syncs, a PocketBase app on the NAS with its own Funnel address and snapshot task; harness infra down removes a project again, after the Engineer's yes."
status: Doing               # Open | Doing | Done | Dropped
depends_on: [T-0003, T-0007, T-0008]  # tasks that must be Done first
decisions: [G-0007, G-0009, G-0011, G-0018, G-0019, G-0020, G-0023, G-0026, G-0027, G-0028, G-0029]
raised_on: 2026-11-20
done_on: ""
result: ["https://github.com/SanderGeraedts/harness/pull/11", "https://github.com/SanderGeraedts/harness/pull/17"]                  # PR URLs
---

# Goal

The second half of spin-up (G-0028). After `harness create` has made the repository and the
app (T-0003), the same command also creates where the project runs:

- the Netlify site with its subdomain and a deploy preview for every pull request;
- for a project that syncs: a PocketBase app on the NAS, on its own dataset, with its own
  Tailscale Funnel address and a periodic snapshot task (G-0023);
- the production build given the backend's address, and nothing else given it (G-0019).

And a separate command removes a project's infrastructure again, after the Engineer's yes.

No secret is on any machine: the work runs as workflows in the Engineer's **private
infrastructure repository**, which holds the secrets in a GitHub environment (G-0026).

This file holds the architecture of the whole of it, under *Notes*. It is built in three
slices, each its own task and pull request:

| Slice | Task | Delivers | Release |
| --- | --- | --- | --- |
| 1 | [T-0007](T-0007-the-infrastructure-repository-the-runner-and-nas-by-workflow.md) | the generator of the private infrastructure repository, the runner on the NAS, `harness nas --remote` | 0.6.0 |
| 2 | [T-0008](T-0008-the-templates-backend-sign-in-and-sync.md) | the template's backend, sign-in and sync, and `create --sync` / `--no-sync` | 0.5.0 |
| 3 | this task | the spin-up and teardown workflows, `create` starting them, the live proof | 0.7.0 |

(Slice 2 merged first and took 0.5.0; 0.4.0 was never tagged, so slice 1 is 0.6.0 and this
slice 0.7.0.)

Slices 1 and 2 don't depend on each other and can be built at the same time. This task's
own slice starts when both are Done.

# Done when

For this task's own slice (3). Each line is run by the tester; the live ones in a session
with the Engineer, on a throwaway project with a name no real project has.

1. `pnpm test`, `pnpm run self-test` and `pnpm run check` pass, and the self-test has the
   steps listed under *What the self-test covers* below.
2. **Refused for anyone else.** `harness create`, `harness infra up` and `harness infra
   down`, run as an account that is not the Engineer, exit 1 with "only the Engineer…"
   before anything is started.
3. **Live spin-up.** `harness create <throwaway> --sync --purpose "…"` ends with `Done.` and
   prints the site's address. Then:
   - the site's address serves the app, and shows the sign-in screen (production);
   - the spin-up run's `checks` job is green: from a GitHub-hosted runner the backend's
     `/api/health` answers 200; the admin screen and the superuser sign-in answer 404; the
     admin port doesn't answer at all; the CORS header is given to the site's origin and to
     no other; and the production bundle holds the backend's address.
4. **Only production knows the backend.** A pull request in the throwaway repository gets a
   deploy preview. It shows the band "Demo data · sync is off" and no sign-in screen, and a
   search of every file the preview serves finds no address ending in the tailnet's domain.
5. **Snapshots.** Through `harness nas --remote`: `pool.snapshottask.query`, filtered to the
   project's dataset, shows one enabled, recursive task; the NAS's snapshot query, filtered
   the same way, shows at least one snapshot. The tester reads the dataset's name from the
   run, and doesn't write it down.
6. **A second run changes nothing.** `harness infra up <throwaway>` again ends green and
   reports every step as "already there"; no second site, key, dataset or task exists.
7. **Nothing leaked.** In the throwaway repository and in this pull request's diff, a search
   finds no token, no auth key, no address ending in the tailnet's domain, no dataset path
   and no address of the NAS. The command's own output shows the site's address and no
   other address.
8. **Sync works in production.** The Engineer makes the superuser and one user (see
   *What stays a human's*), signs in on two devices, changes an item on each while offline,
   and confirms both end up with the same data.
9. **Teardown.** `harness infra down <throwaway>` without `--confirmed` lists what would be
   deleted and exits 2 without starting anything. With `--confirmed`, after the Engineer's
   yes in chat, the run ends green; the site's address no longer serves the app, the
   backend's address no longer answers, and `pool.dataset.query` no longer shows the
   dataset. `harness infra down` on a name whose dataset was not made by spin-up refuses.
10. **The Engineer confirms** the throwaway repository, its container image and its machine
    in the tailnet's admin console are gone, which only they can remove.

Q-001 is resolved by G-0030, so nothing here waits for it; see *Open question (resolved)*.

# Notes

## Where everything lives

**In the harness** (public, tested here, released by tag):

- Commands, in `lib/` with unit tests:
  - `harness infra init`, `harness infra runner …`, `harness nas --remote` (T-0007);
  - `harness create --sync | --no-sync` (T-0008);
  - `harness infra up <project>` and `harness infra down <project> --confirmed`, and
    `create` calling `infra up` as its last step (this task).
- The logic of every infrastructure step, in `lib/infra/`, as functions that take their
  outside world as arguments (a `fetch`, a NAS client), so the unit tests run them against
  fakes: the Netlify calls, the Tailscale calls, the app's compose file, the dataset and
  snapshot task, the outside checks. A workflow step is one line that runs
  `harness infra step <name>`.
- Reusable workflows, in `.github/workflows/`, each `on: workflow_call`:
  `infra-nas.yml`, `infra-check.yml` (T-0007), `infra-project-up.yml`,
  `infra-project-down.yml` (this task), and `backend.yml` for a project's backend image
  (T-0008).
- The template's backend, sign-in and sync, as an overlay (`template-sync/`) that `create`
  copies over `template/` when the project syncs (T-0008).

**In the private infrastructure repository** (thin, generated by `harness infra init`,
never edited by hand):

- One caller workflow per reusable one, `on: workflow_dispatch`, a dozen lines each:
  `nas.yml`, `check.yml`, `project-up.yml`, `project-down.yml`. Each passes its inputs on,
  with `secrets: inherit`, the environment's name and the harness tag it is pinned to.
- A README that says what the repository is and that its files are generated.
- Nothing per project, and nothing that identifies the infrastructure. What exists is read
  from Netlify and the NAS each time; they are the state.
- Its GitHub environment (default name `Prod`, a setting) holds `NETLIFY_AUTH_TOKEN`,
  `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` and `TRUENAS_API_KEY`. The Engineer made it; the
  harness only checks the names are there.

**On the NAS:**

- The runner app, with the NAS's address, the certificate's fingerprint and the parent
  dataset for apps in its own configuration (T-0007).
- Per project: one dataset with two children (`pb_data`, `tailscale`), a snapshot task, and
  one custom app of three containers.

**In a created project** (with `--sync`; T-0008):

- `backend/`: the image's `Dockerfile`, `pb_migrations/`, `pb_hooks/`, `funnel.json` (the
  paths the internet may reach), `smoke-test.sh` and a README.
- `.github/workflows/backend.yml`, a caller of the harness's reusable `backend.yml`, and the
  auto-merge caller with `backend-workflow` and `backend-paths` set (G-0011).
- `src/sync/` and `src/auth/`, and the project decisions that go with them.
- Nothing about where it runs: no address, no site id, no dataset.

## The settings

| Setting | Where | Default |
| --- | --- | --- |
| the private infrastructure repository, as `owner/name` | `HARNESS_INFRA_REPO` in the Engineer's environment, or the user-level file `harness infra init` writes | none: the commands stop and say how to set it |
| the environment's name | `HARNESS_INFRA_ENVIRONMENT`, and written into the generated callers | `Prod` |
| the NAS's address, fingerprint and parent dataset for apps | the runner app's configuration, on the NAS | set once, at the runner's install |
| snapshot schedule and how long one is kept | constants in `lib/infra/` | every hour, two weeks |

None of these is a secret, and none is written into the harness or a project.

## The sequence of spin-up

`harness create <name> [--sync]`, in a session with the Engineer, from any machine.

**Locally, before anything is written** (`create`):

1. The Engineer check, as now.
2. `gh`'s token has the `workflow` scope, as now.
3. New: the infrastructure is ready. The setting names a repository the account can write
   to; its environment has the four secret names; and, when the project syncs, the runner
   is online (`gh api repos/<it>/actions/runners`). Otherwise stop, and say which one-time
   step is missing. `--no-infra` skips this and everything below marked *new*.
4. New: the Netlify GitHub App can see repositories of this account (`gh api
   user/installations`). Covering all repositories: go on. Covering selected ones: `create`
   adds the new repository to it after creating it (`PUT
   user/installations/<id>/repositories/<repository id>`). Not installed, or the call is
   refused: spin-up goes on without hosting and ends with a `Remaining:` line telling the
   Engineer to give the app access and run `harness infra up <name>`.

**Locally** (`create`, as built in T-0003): the app from the template, the first commit, the
repository (private by default, G-0029), the first push, the first CI run, and the ruleset
where GitHub allows one. For a private repository it says, once and calmly, that there is no
ruleset until the repository is public (T-0007 changes the wording).

5. New, when the project syncs: wait for the first run of the project's `backend` workflow
   on `main`, which publishes the image `ghcr.io/<owner>/<name>-backend:stable`.

**Locally, last** (`harness infra up <name>`, which `create` calls and which can be run
again by itself, from the project's folder):

6. Read `backend/funnel.json` and check it (see *The backend app*).
7. Start `project-up.yml` in the private infrastructure repository with `gh workflow run`.
   Inputs: the project's name, `owner/name`, whether it syncs, the Funnel paths as JSON, the
   Netlify app's installation id, and a request id. The run is named after the request id,
   which is how the command finds it again.
8. Wait for the run. Print its conclusion and the one line of its log that carries the
   site's address. On failure, print the failed step's name and how to look at the run; a
   second `harness infra up` continues where it stopped.

**In the workflow** (`infra-project-up.yml`), four jobs:

| Job | Runs on | Needs | Does | Gives |
| --- | --- | --- | --- | --- |
| `site` | GitHub's runner | `NETLIFY_AUTH_TOKEN` | Finds the Netlify site linked to `owner/name`, or creates it: named after the project, linked through the app's installation, build settings from `netlify.toml`, deploy previews on. | the site's id and address |
| `address` | GitHub's runner | the Tailscale OAuth client | Only when the project syncs. Joins the tailnet as a short-lived node tagged `tag:harness`, reads the tailnet's DNS suffix, and leaves. | the backend's address: `https://<name>.<suffix>` |
| `backend` | the runner on the NAS | `TRUENAS_API_KEY`, the OAuth client, the site's address | Only when the project syncs. See *The backend app*. | a running app with a snapshot task |
| `checks` | GitHub's runner | `NETLIFY_AUTH_TOKEN`, both addresses | The outside checks (below). Then sets `BACKEND_URL` on the site for the **production context only**, starts a production build, waits for it, and checks that the bundle it serves holds the address. | green, or the step that failed |

Order: `site`, then `address` and `backend` side by side, then `checks`. For a project that
doesn't sync, only `site` runs, and no `BACKEND_URL` is set.

Every step first looks for what is already there and says "already there" instead of
making a second one.

One NAS job runs at a time (a `concurrency` group on the runner's jobs).

## The backend app

The proven layout: one custom app per project, three containers, generated by
`lib/infra/compose.mjs` from the project's name, its image, the site's origin and the
dataset's path.

- **A Tailscale sidecar.** Its own auth key; state in the `tailscale` child dataset;
  Funnel on 443 with the path allowlist; the admin screen on a second port that only the
  tailnet reaches. The serve configuration is an inline `configs:` entry of the compose
  file, so no file has to be written to the NAS (mind the `$$` for its `${TS_CERT_DOMAIN}`).
- **PocketBase,** in the sidecar's network, so no port is published on the NAS. The
  project's image at `:stable`, data in the `pb_data` child dataset, CORS open to the site's
  origin only.
- **Watchtower,** which updates the PocketBase container only.

Image versions are pinned as constants in the harness and bumped by pull request.

The `backend` job, in order, through the NAS client (`harness nas`'s library form):

1. **The dataset:** `pool.dataset.create` for `<parent>/<name>` and its two children, with
   the ZFS user property `harness:project=<name>`. That property is what teardown looks for.
2. **The snapshot task** (G-0023): `pool.snapshottask.create` on the project's dataset,
   recursive, every hour, each kept two weeks; then run it once, so a first snapshot exists
   before any data does.
3. **The auth key:** from the Tailscale API with the OAuth client: one use, pre-authorised,
   tagged `tag:harness`, valid for minutes. It is made in this job because a job can't hand
   a secret to another. A tagged node's key doesn't expire.
4. **The app:** `app.create` with the compose file, carrying the auth key. When the app
   already exists: `app.update` with the regenerated compose file and no key.
5. **Wait** until the app runs, then `app.update` once more without the auth key. The login
   is in the `tailscale` dataset by then.

**The Funnel paths** come from the project's `backend/funnel.json`, a list of path prefixes.
`harness infra up` and the workflow both refuse a list that holds anything but paths under
`/api/`, or that would open `/api/` whole, the admin screen (`/_/`), or the superusers
collection. Changing the list is a pull request in the project, then `harness infra up`.

**The outside checks,** from a GitHub-hosted runner that is *not* on the tailnet, with up to
ten minutes of patience for a new Funnel name: `/api/health` is 200; `/_/` and
`/api/collections/_superusers/auth-with-password` are 404; the admin port doesn't connect;
`/api/health` with the site's origin gets the CORS header, and with another origin doesn't.
The CORS check also proves the name leads to *this* project's backend.

## Hosting

- The site is named after the project; if Netlify has the name already, the name gets a
  short suffix. The address is `<site name>.netlify.app`. A domain of the Engineer's own is
  not part of spin-up: it costs money or touches DNS, so it is asked for separately.
- Production gets `BACKEND_URL`, with the context `production` and the scope "builds".
  Previews and branch deploys get nothing (G-0019). `vite.config.ts` ignores the variable
  outside production as well, so there are two locks.
- The content security policy can't name the backend in `netlify.toml`: the address may not
  be in the repository. T-0008 moves the policy to a `_headers` file written at build time,
  which adds the backend's origin to `connect-src` in a production build only.

## Snapshots

Set up in the `backend` job, step 2, before the app first starts. Done-when 5 shows the
task and a snapshot. Rolling back or deleting a snapshot stays destructive (G-0027) and is
not part of any workflow here except teardown.

## Teardown

`harness infra down <project> --confirmed`, from any machine, the Engineer only.

- Without `--confirmed` it prints what would be deleted (the site, the app, the dataset
  with every snapshot of it) and exits 2. Claude Code asks a human before any command that
  carries `--confirmed`, and the agent has asked in chat first (G-0027, G-0028).
- With it, it starts `project-down.yml` with the project's name twice: as the project and
  as the confirmation. The workflow refuses when they differ.
- The workflow deletes, in this order: the Netlify site, the app, the snapshot task, the
  dataset. Each only when it is provably the project's:
  - the site only when it is linked to `owner/name`;
  - the dataset only when it carries `harness:project=<name>` and sits directly under the
    parent dataset. A dataset made by hand can never be deleted by this command.
- It ends with a `Remaining:` line for what only the Engineer can remove: the machine in
  the tailnet's admin console (the OAuth client may only write auth keys), the repository,
  and its container image.
- There is no "undo". The dataset's snapshots go with it.

## What stays a human's

Once, before the first spin-up (T-0007 checks each and says which is missing):

- `gh auth refresh -s workflow`.
- The private infrastructure repository with its environment and four secrets (made).
- In the tailnet's policy: nodes tagged `tag:harness` may use Funnel, with MagicDNS and
  HTTPS certificates on.
- The Netlify GitHub App installed for the account, best for all repositories.
- The runner's install, at home (T-0007).

Per project, after spin-up, listed by `create` as `Remaining:`:

- The superuser and the first user. A new PocketBase has neither, and sign-up is closed.
  The Engineer makes the superuser in the PocketBase container's shell on the NAS and the
  user in the admin screen, from a device on the tailnet. No workflow does this: it would
  have to invent a password a human then needs. Who may sign in is the Engineer's (G-0009).

## What the self-test covers

Without any real infrastructure (G-0015):

- Unit tests, with fakes for `fetch`, `gh` and the NAS client:
  - the compose file for an example project, compared with a stored one; it holds no key
    after the second update;
  - the Funnel path check: what it accepts and each thing it refuses;
  - each job's steps in order, and a second run that creates nothing;
  - a failing step: the error names the step and holds no secret from the fake;
  - teardown: refuses without `--confirmed`, with a wrong confirmation, for a site linked
    to another repository, and for a dataset without the property;
  - `infra up` finding its run by the request id, and printing only the site's address.
- Self-test steps, in the throwaway project:
  - `create` and `infra up` refuse an account that is not the Engineer;
  - `infra up` and `infra down` stop with a plain message when no infrastructure
    repository is set;
  - `infra down` without `--confirmed` exits 2;
  - the reusable workflows parse, every job that uses a secret names the environment, and
    only `backend` and the NAS jobs run on the self-hosted runner.

## The live proof

- A throwaway project with a made-up name, private, created with `--sync`.
- The tester runs Done-when 3 to 9 in a session with the Engineer and writes the results
  under *Test*: commands and outcomes, with every address, dataset and run address left
  out. The site's address may be shown; the backend's never.
- The search of Done-when 7 covers the throwaway repository's files and history and this
  pull request's diff, for: `tskey-`, the tailnet's domain ending, `/mnt/`, IPv4
  addresses, and the Netlify site id.
- It ends with teardown (Done-when 9 and 10), so nothing of the proof stays behind.

## Open question (resolved)

- **Q-001** ([how does the NAS pull a private project's backend image?](../decisions/Q-001-how-does-the-nas-pull-a-private-projects-backend-image.md))
  is resolved by G-0030: while a repository is private, the NAS pulls its image with a
  read-only token, `GHCR_PULL_TOKEN`, held as a fifth secret in the environment; a public
  repository's image is public and needs none. Nothing in this task waits for it any more.

## As built, and open for the architect

What slice 3 built differs from these Notes in four places, and two points remain for
future tasks. None of them blocks this task.

- **Netlify's app, as built:** `gh api user/installations` needs a GitHub App user token and
  answers 403 to gh's token, so `create` can't check the app before it starts (step 4 of the
  sequence above). The `site` job instead reads the app's installation from a site of the
  account that is already linked through it, or takes `--netlify-installation` (or
  `netlifyInstallation` in the settings file). Without one it makes the site unlinked and ends
  with a `Remaining:` line.
- **Where the pull token lives (for the architect):** the NAS pulls a custom app's images
  with its own registry credentials, so the token is one NAS-wide `app.registry` entry for
  `ghcr.io` (`harness-ghcr`), plus `REPO_PASS` in each private project's Watchtower
  environment for its later pulls. G-0030 says "the app's configuration"; whether that wording
  or this build changes is the architect's.
- **Variable scopes:** Netlify's free plan refuses scopes on a site variable, so `BACKEND_URL`
  (production context only) and the mark `HARNESS_REPOSITORY` have every scope and also reach
  functions. Neither is a secret; previews and branch deploys still get no `BACKEND_URL`.
- **Future task: `trustedProxy`.** Behind Funnel, Tailscale's proxy sends `X-Forwarded-For`,
  but PocketBase counts its sign-in rate limit per address, which is the proxy's for every
  device until its `trustedProxy` setting names that header. That is a template migration
  and a decision on trusting the header.
- **Future task: the outbox policy** (from T-0008): what the app does with a change the
  backend refuses for good, which now holds up every change behind it.

## Risks to prove early

- That a job in a reusable workflow, called with `secrets: inherit` and naming an
  environment, receives the caller repository's environment secrets. T-0007 proves it with
  the first `nas.yml` run. If it doesn't hold, the generator writes the jobs out in full
  instead of calling reusable ones; nothing else changes.
- That Netlify's API links a private repository through the app's installation without a
  deploy key. If it needs one, `create` adds the key Netlify gives to the repository with
  `gh`.
- That the hosted runner can read the tailnet's DNS suffix after joining with a key from
  the OAuth client. If it can't, the suffix becomes a fifth secret, and that is a question
  for the Engineer.

# Design

Nothing visible in the app beyond what T-0008 designs. What the Engineer sees is the output
of `harness create`, `harness infra up` and `harness infra down`: one `✓` line per step in
the style `create` has now, the site's address at the end, and `Remaining:` lines for what
a human still has to do.

The wording as built (developer, slice 3), with made-up names:

```text
$ harness infra up my-project
Spinning up engineer/my-project (private, with a backend)
✓ the infrastructure: the environment Prod has its secrets
✓ the runner harness-nas: online
✓ the backend image: published
Starting project-up.yml; this takes a while…
✓ the site: created, https://my-project.netlify.app
✓ the site builds from engineer/my-project, with a deploy preview for every pull request
✓ the tailnet: MagicDNS, HTTPS certificates and Funnel for tag:harness are on; the backend's address is known
✓ the project's dataset: created, marked harness:project=my-project
✓ its datasets pb_data and tailscale: there
✓ the snapshot task: created, every hour, each kept two weeks; a first snapshot started
✓ the NAS may pull private images from ghcr.io: set up
✓ the app: created, with a one-use auth key for tag:harness
✓ the auth key: removed from the app's configuration
✓ the app: running
✓ from the internet, the backend answers /api/health with 200
✓ the admin screen answers 404 from the internet
✓ the superuser sign-in answers 404 from the internet
✓ the admin port doesn't answer from the internet
✓ CORS answers the site's origin, and no other
✓ BACKEND_URL on the site, for production only: set
✓ the production build: done
✓ the site serves the app
✓ the site's headers (dist/_headers) let it reach the backend, and only production's do
✓ the production bundle holds the backend's address
The site: https://my-project.netlify.app
Remaining: the backend has no superuser and no user yet. The Engineer makes the superuser in the PocketBase container's shell on the NAS, and the first user in the admin screen, from a device on the tailnet.
Done.
```

A second run says "already there" for each step. A missing human step is one `Remaining:`
line that says exactly what to do, and the run ends `Not finished: see the Remaining lines.`
`harness infra down my-project` prints what it would delete and exits 2; with
`--confirmed` it ends with the `Remaining:` line for the machine in the tailnet, the
repository and its image. `create` ends with `Done.`, the repository's address and `The
site: …`, or with `Created, but spin-up isn't finished: …, run harness infra up <name>.`

# Test

Tester, 2026-11-21, on `2635545` (last content `015c0c1`), in a fresh worktree. Every
address but the site's, the tailnet's name, the dataset's path and run addresses are left
out; `<backend>` stands for the backend's origin, read from the production site's policy
into a scratch file and never printed.

**Verdict: sent back.** Two defects, below. Everything else that could be run holds.

## The checks

- `pnpm install --frozen-lockfile`: `Lockfile is up to date … Done in 372ms`.
- `pnpm test`: `tests 257, suites 49, pass 256, fail 0, skipped 1` (the jq test, `# needs
  bash and jq`; it runs in CI).
- `pnpm run check`: `✓ tasks: 9 tasks, index in step`, `✓ global decisions: 29 records,
  index complete`, `✓ agents: 4 definitions`.
- `pnpm run self-test`: first run `✗ self-test failed at step 25: … EPERM: operation not
  permitted, rename '…\spun-up\_github' -> '…\spun-up\.github'` (Windows holding the new
  folder a moment; the rename is unchanged from main); second run `✓ self-test passed: 30
  steps, harness 0.7.0 in a throwaway project`, with the steps the Notes list (16, 18, 19,
  20, 24).
- `node scripts/self-test.mjs --e2e`: `✓ self-test passed: 32 steps, harness 0.7.0 in a
  throwaway project`.
- `node --test test/workflows.test.mjs test/infra.test.mjs test/spinup.test.mjs`: `tests
  132, pass 131, fail 0` (the jq one skipped); among them `the four generated callers, with
  any environment and ref` and `are valid YAML that a parser reads back as meant`.

## The live proof, from outside (Done-when 3 to 7)

- **Production** `https://harness-spinup-proof.netlify.app/`: `200`; headless Chrome shows
  "Sign in" and "Sign in to see your items and keep them the same on every device.", no
  "Demo data", no tailnet name in the page. `connect-src 'self' <backend>`: exactly two
  entries, the second an `https://harness-spinup-proof.<tailnet>` origin.
- **The backend:** `/api/health` 200; the items list signed out 200 with `totalItems 0
  items 0` and `Access-Control-Allow-Origin` the site's origin; with another origin, and a
  preflight from another origin, no CORS header; sign-up 403; `/_/` 404; the superuser
  sign-in 404; `/api/collections`, `/api/collections/`, `/api/settings`, `/api/backups`,
  `/api/logs` 404; `../`, `%2e%2e/` and `..%2f` into `_superusers` from an allowed path
  404; `/API/collections/_superusers/records` 404; the admin port gives no TLS (curl exit
  35); port 80 redirects to https.
- **The deploy preview** `deploy-preview-1--harness-spinup-proof.netlify.app` (draft #1 in
  the throwaway): `200`, `connect-src 'self'`; headless Chrome shows "Demo data · sync is
  off", the demo items, no "Sign in" (3 of 5 renders; the other 2 headless renders were
  empty, a virtual-time quirk). A crawl of what it serves: `{"files":15,
  "filesWithNeedle":0,"filesWithTsNetName":0,"ipv4":[]}`; the same crawl of production:
  `{"files":15,"filesWithNeedle":1,"filesWithTsNetName":1,"ipv4":["127.0.0.1"]}`.
- **Snapshots,** through `harness nas --remote` (read only): `pool.snapshottask.query`
  filtered to the project: 1 task, `enabled: true`, `recursive: true`, minute 0 every hour,
  `2 WEEK`, state `FINISHED`. `pool.snapshot.query` filtered server-side with `~` gave 0;
  all names read and filtered here: 33 snapshots, 11 each on the dataset, `pb_data` and
  `tailscale`, hourly from `auto-2026-11-20_21-11` to `auto-2026-11-21_07-00`. The three
  datasets carry `harness:project=harness-spinup-proof`, and no other dataset on the NAS
  carries the mark. `app.query`: `RUNNING`.
- **A second run changes nothing:** `harness infra up harness-spinup-proof` (exit 0, the
  infrastructure repository pinned to `8e2d0f4`; `8e2d0f4..015c0c1` changes only this file
  and test stand-ins): every step `already there` (site, link, dataset, snapshot task, pull
  registry, app `nothing changed`, `BACKEND_URL … already there`, `the production build:
  already there`), every outside check ✓, `The site: https://harness-spinup-proof.netlify.app`,
  the `Remaining:` line for the superuser and user, `Done.` No address but the site's.
- **Nothing leaked:** in this pull request's diff and commit messages, and in every file and
  commit of the throwaway's four refs: no `tskey-`, `.ts.net`, `/mnt/`, `nfp_`, `ghp_`,
  `github_pat_`, `gho_`, `ghs_`, private key, the backend's address, the tailnet's name, the
  infrastructure repository's name or any UUID (so no Netlify site id); IPv4 only `0.0.0.0`
  and `127.0.0.1`. The diff names the throwaway only in this file's Log. In the last 11 runs
  of the infrastructure repository (3,765 log lines, both `project-up` runs among them):
  every secret shows as `***`; no key prefix, no IPv4, no `/mnt/`; the backend's address
  twice, as the `checks` job's `BACKEND_URL`, in the private repository's own log, which
  G-0027 allows. The environment `Prod` has `GHCR_PULL_TOKEN`, `NETLIFY_AUTH_TOKEN`,
  `TRUENAS_API_KEY`, `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` (names only).

## What failed

1. **The pull request conflicts with `main`** (`gh pr view 17 --json mergeable`:
   `CONFLICTING`; `git merge-tree --write-tree origin/main HEAD`: `CONFLICT (content): Merge
   conflict in docs/tasks/T-0004-spin-up-hosting-and-backend.md`). `main` added the
   architect's Log line for G-0030 (#14) after this branch left it. That is why no
   `pull_request` run attaches to #17 (`statusCheckRollup: []`; the newest `pull_request`
   run is on `8e2d0f4`): GitHub can't make the merge commit. With no required check on the
   pull request it can't be marked ready or merge. Fix: merge `main` into the branch (keep
   both Log lines); the Notes' *Open question* and "3, 4, 8 and 9 need Q-001 answered" are
   then out of date too.
2. **Teardown can be started without the ask rule.** `.claude/settings.json` asks a human
   for `*--confirmed*` and `*confirmed=true*`. `harness infra down <p> --confirmed` is
   caught, but `project-down.yml` takes `confirmation=<project>`, not `confirmed=true`, so
   `gh workflow run project-down.yml --repo <infra> -f project=<p> -f repository=<o>/<p> -f
   confirmation=<p>` matches no ask rule and deletes the site, the app and the dataset with
   every snapshot without a prompt. The environment has no protection rule either
   (`protection_rules: []`). `nas.yml` was closed against exactly this (self-test step 17);
   teardown reopens it. Fix it so a direct start of the teardown workflow is asked too, and
   prove it in the self-test as step 17 does for `nas.yml`.

## Read, and found sound

- **Teardown** refuses without `--confirmed` (lists, exit 2, starts nothing; self-test 19),
  every job refuses a confirmation that isn't the name, `inspect` refuses an unmarked
  dataset or unlabelled app of the name before anything goes, the site only when marked and
  not linked elsewhere, the dataset only by exact id `<parent>/<project>` with the mark.
  Not checked: whether the mark is set on the dataset itself or inherited from the parent;
  today no other dataset carries it.
- **`wait-for`** in auto-merge: waits while a named workflow runs for the head, refuses when
  its newest run failed, ignores one that didn't run, and a second deciding run finds the
  pull request merged. It reads only `event=pull_request` runs, so a Backend run started by
  hand for the head isn't counted.
- **Taking over an empty site of the same name:** only in the token's own account, only the
  exact name, only with no repository, no `repo_url`, no published deploy and no mark. A
  site whose deploys were all drafts or all failed would still count as empty; asking
  `/sites/<id>/deploys` for none at all would close that.

## The developer's open points

- (1) The Netlify app check: the installation read from a linked site or given by
  `--netlify-installation` works live; the Notes' plan (`user/installations`) is out of date.
  For the architect, to record.
- (2) The pull token as an `app.registry` entry on the NAS plus Watchtower's `REPO_PASS`:
  wider than G-0030's "the app's configuration" (the registry entry serves every app on the
  NAS). For the architect; a decision if it stays.
- (3) No variable scopes on Netlify's free plan, so `BACKEND_URL` also reaches functions:
  not a secret, G-0019 still holds for previews. For the architect to note in the Notes.
- (4) The `trustedProxy` rate limit: every visitor shares one address behind Funnel, so
  PocketBase's rate limit is shared. A template migration plus a decision to trust
  `X-Forwarded-For`: architect, as its own task.
- (5) The outbox's refused-change policy: open from T-0008; architect, own task.

None of them needs the Engineer now; (2) needs the Engineer only if the architect proposes
replacing G-0030.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.

- 2026-11-20 engineer: decided that the secrets are held by a GitHub environment of a
  private infrastructure repository and that infrastructure work runs there as workflows,
  started with `gh workflow run` from any machine; that no agent ever reads, prints or
  carries a secret; and that new repositories stay private by default, without a ruleset
  until they are public. Recorded as G-0026 to G-0029, which replace G-0022, G-0024 and
  G-0025.
- 2026-11-20 architect: wrote the architecture (under *Notes*) and split the task in three
  slices: T-0007, T-0008 and this one. Decided that a workflow reaches the NAS through a
  self-hosted runner that is an app on the NAS (in G-0027): no setting-up by hand beyond
  its install, managing the NAS doesn't depend on the tailnet, and only the Engineer can
  start a job. Decided that the NAS's address, fingerprint and parent dataset live in the
  runner's configuration; that teardown deletes only what carries the project's mark; and
  that the first accounts on a new backend are made by the Engineer.
- 2026-11-20 architect: raised Q-001, how the NAS pulls a private project's backend image.
  Handed T-0007 to the developer and T-0008 to the UX designer. This task's own slice waits
  for both, and its live proof for Q-001.
- 2026-11-20 architect: Q-001 answered by the Engineer (option C), recorded as G-0030: a read-only pull token, `GHCR_PULL_TOKEN`, as a fifth secret while a repository is private; none once it is public. The image pull no longer waits.
- 2026-11-20 developer: built slice 3 in #17 (0.7.0). `harness infra up <project>` reads
  `backend/funnel.json` from the default branch and refuses a bad list, checks the four
  secrets and the runner (a missing `GHCR_PULL_TOKEN` is a warning: G-0030), starts
  `project-up.yml` and prints each job's lines in order, naming only the site's address.
  `harness infra down <project>` lists what would go and exits 2; with `--confirmed` it starts
  `project-down.yml` (`inspect` refuses a dataset or app of the name that spin-up didn't make
  before anything goes, then `site`, then `backend`). `create` checks the infrastructure
  before writing anything and ends by waiting for the first `backend` run and spinning up
  (`--no-infra`). The logic is in `lib/infra/` (`project`, `netlify`, `tailscale`,
  `backend`, `checks`, `spinup`) with `test/spinup.test.mjs` against fakes and a stored
  compose file (`test/fixtures/backend-compose.json`). T-0008's open point: the reusable
  `auto-merge.yml` takes `wait-for`, and the template's caller runs on `[CI, Backend]` with
  `wait-for: CI,Backend`, so a pull request whose Backend run failed doesn't merge; a test runs
  that bash and jq on sample runs (CI only, where jq is). `pnpm test`: `tests 257, pass 256,
  fail 0, skipped 1` (the jq test, here). `pnpm run self-test`: `✓ self-test passed: 30
  steps, harness 0.7.0 in a throwaway project`. `pnpm run check`: tasks, global decisions and
  agents ✓. In CI on #17: `checks / checks` (`tests 254, pass 254, skipped 0`; the self-test 30
  steps), `template-e2e` (32 steps) and `template-backend / image` green.
- 2026-11-20 developer: live proof, on a private throwaway `harness-spinup-proof`, with the
  infrastructure repository pinned to this branch's commits through its own pull requests.
  `harness create harness-spinup-proof --sync` made the repository, CI green, the calm
  ruleset line, then waited for the first `backend` run on `main`: **the publish job ran for
  the first time and succeeded**. Its spin-up stopped at the `site` job: Netlify's free plan
  answered 403 "Upgrade your Netlify account to set specific scopes" to a site variable with
  scopes (fixed: no scopes; a site made but not marked is deleted again; an empty, unlinked,
  unmarked site of the project's name is taken). The `address` job already said ✓ for MagicDNS,
  HTTPS and Funnel for `tag:harness`. One EOF from GitHub's API then ended a second `infra up`
  while its run went on (fixed: a few failed looks are let pass). That run ended green on all
  four jobs: the site taken and linked through the app's installation read from another site
  of the account, the dataset marked, `pb_data` and `tailscale`, the snapshot task and a first
  snapshot, the pull token on the NAS, the app with a one-use key and then without it, and
  every outside check ✓ (health 200; admin screen and superuser sign-in 404; admin port silent;
  CORS for the site only; `BACKEND_URL` for production; the production build; the site's
  `_headers` with the backend in `connect-src`, which proves T-0008's open point; the bundle
  holds the address). A third `infra up` said "already there" for every step and ended
  `Done.` (Done-when 6).
- 2026-11-20 developer: checked from outside, printing no backend address. Production: the
  site 200, a headless browser shows the sign-in heading and no demo band, it asks only the
  site's host before signing in, `connect-src 'self' <the backend>`; the backend: `/api/health`
  200, the items list signed out 200 with 0 items and CORS for the site, a made-up sign-in 400,
  sign-up 403, `/_/`, the superuser sign-in and `/api/collections` 404. A draft pull request
  (#1 in the throwaway) got a deploy preview: the band "Demo data · sync is off", no sign-in
  heading, 7 demo items, `connect-src 'self'`, no request beyond its own host, and of the 9
  files it serves none names a tailnet address (production's bundle does). Through `harness nas
  --remote`, filtered to the project's dataset: one snapshot task, enabled, recursive, every
  hour, kept 2 weeks, last run FINISHED; 6 snapshots (2 each on the dataset, `pb_data` and
  `tailscale`). The app: RUNNING. A search of the throwaway repository's files and history
  for `tskey-`, `.ts.net`, `/mnt/`, `nfp_`, `ghp_` found nothing, and IPv4 only `0.0.0.0` and
  `127.0.0.1`; this pull request's diff likewise (its test stand-ins for keys were renamed so
  no real prefix appears). Done-when 3 to 7 hold, except the sync between two devices.
- 2026-11-20 developer: for the architect. (1) `gh api user/installations` needs a GitHub App
  user token, so `create` can't see Netlify's app as the Notes planned (403 with gh's token);
  the `site` job reads the installation from a site of the account linked through it, or
  `--netlify-installation` / `netlifyInstallation` in the settings file. (2) The pull token
  reaches the NAS as one `app.registry` entry for `ghcr.io` (TrueNAS pulls a custom app's
  images with the NAS's registry credentials) and Watchtower's `REPO_PASS` in the app;
  G-0030 says "the app's configuration". (3) Netlify variables have every scope on a free
  plan, so `BACKEND_URL` (production context only) also reaches functions; it isn't a secret.
  (4) Behind Funnel, Tailscale's proxy sends `X-Forwarded-For`; PocketBase's rate limit
  shares one address until its `trustedProxy` setting names that header. That is a template
  migration and a decision on trusting the header: not built here. (5) A refused-change
  policy for the outbox stays open from T-0008.
- 2026-11-20 developer: Remaining: Done-when 8, sync on two devices, needs the Engineer to
  make the superuser and a user (see *What stays a human's*); Done-when 9 and 10, teardown
  with `harness infra down harness-spinup-proof --confirmed` after the Engineer's yes in chat,
  then the machine in the tailnet's admin console, the throwaway repository and its image;
  the tester's pass; after the tag `v0.7.0`, `harness infra init` once more to pin the
  infrastructure repository to it.
- 2026-11-21 tester: sent back: the pull request conflicts with `main` (this file's Log),
  so no `pull_request` check runs; and `gh workflow run project-down.yml … -f
  confirmation=<p>` starts teardown without any ask rule. See *Test*.
- 2026-11-21 developer: fixed what the tester sent back. (1) Merged `main`: both Log lines
  kept (the architect's G-0030 line before this branch's); the Notes now say Q-001 is resolved
  by G-0030 (*Open question (resolved)*, and the line under *Done when*), and a new *As built,
  and open for the architect* records the Netlify app check as built, the pull token as a
  NAS-wide registry entry plus Watchtower's `REPO_PASS` (for the architect, against G-0030's
  wording), variable scopes reaching functions, and `trustedProxy` and the outbox policy as
  future tasks. (2) `harness sync` also writes the ask rules `Bash(*project-down*)`,
  `Bash(*confirmation=*)`, `PowerShell(*project-down*)` and `PowerShell(*confirmation=*)`, the
  harness's own `.claude/settings.json` has them, `rules/AGENTS.md` says so, and self-test step
  18 checks that a direct start of teardown asks in Bash and PowerShell (`gh workflow run
  project-down.yml … -f confirmation=p`, by name without `.yml`, by workflow id with
  `confirmation=`, and `gh api …/project-down.yml/dispatches`), while `infra down` without
  `--confirmed` and `infra up` ask nobody. It only adds ask rules; nothing is loosened.
  (3) An "empty" site is taken over only when `/sites/<id>/deploys` is empty too.
  Checks: `pnpm test`: `tests 257, pass 256, fail 0, skipped 1` (the jq test, which runs in
  CI); `pnpm run self-test`: `✓ self-test passed: 31 steps, harness 0.7.0 in a throwaway
  project`; `pnpm run check`: `✓ tasks: 9 tasks, index in step`, `✓ global decisions: 30
  records, index complete`, `✓ agents: 4 definitions`.
