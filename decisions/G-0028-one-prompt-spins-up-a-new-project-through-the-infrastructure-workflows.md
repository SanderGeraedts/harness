---
id: G-0028
title: "One prompt spins up a new project: the repository and app locally, hosting and backend through the infrastructure workflows, by the Engineer only"
description: "One prompt creates the repository and the app with harness create, then starts workflows in the private infrastructure repository that create the Netlify site and, when the project syncs, a PocketBase app on the NAS with its own Funnel address and snapshot task; only the Engineer can do it, and removing a project is a separate command that asks."
status: Accepted            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.4.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: [G-0024]
replaced_by: []
tags: [operations]
---

# Context

Starting a project by hand means a repository, the app's scaffold, a hosting site, a
backend app, an address for each and the wiring between them: an afternoon of steps that are
the same every time and easy to get subtly wrong.

G-0024 recorded that one prompt would do all of it, with the tokens in the Engineer's
environment. The repository and the app are built (`harness create`). The secrets now live
in a GitHub environment of a private infrastructure repository (G-0026), which changes
where the second half runs.

# Decision

- **One prompt creates** the repository, the app (from the stack in G-0017, with the harness
  installed), the Netlify site with its subdomain and deploy previews, and, when the project
  syncs (G-0020), a PocketBase app on the NAS with its own Funnel address and its snapshot
  task (G-0023).
- **It runs in two places:**
  - **locally, in `harness create`:** the repository, the app, the first push, the first CI
    run and, where GitHub allows it, the ruleset (G-0029). A workflow's own token can't
    create a repository or write to another one, so this part stays local and uses `gh`;
  - **in workflows of the private infrastructure repository** (G-0026), which `create`
    starts with `gh workflow run`: everything that talks to Netlify, Tailscale and the NAS
    (G-0027).
- **The project's repository receives nothing secret or identifying.** The backend's address
  goes to the hosting site's production settings only (G-0019).
- **Only the Engineer can do it.** `create` refuses anyone else, and only the Engineer can
  start a workflow in the private infrastructure repository.
- **Creating is free of charge and can be reversed, so it needs no further yes. Removing is
  not:** deleting a project's site, its node, its app or its dataset is a separate command
  that says exactly what will go and waits for the Engineer's yes (G-0009).

# Rationale

Everything a new project needs is already decided globally, so creating one can be
mechanical. Splitting it where the secrets are keeps each half as small as it can be: the
local half needs only `gh`, and the half that needs secrets runs where they are. Keeping
removal apart, behind a question, means the command that is run often can never destroy
anything.

# Consequences

- Spin-up needs the private infrastructure repository to exist, with its environment, its
  secrets and the runner on the NAS (G-0027); setting those up is done once.
- A step a workflow can't do (a hosting app that isn't allowed to see the new repository,
  the first accounts on a new backend) ends the run with a plain line saying what the
  Engineer still has to do, instead of failing halfway.
- A run that stops can be started again: every step first looks for what is already there.
- An existing repository still adopts the harness with `harness init` or `harness adopt`.

# Guidance for agents

- Don't create infrastructure for a new project in a Requester's session; raise it for the
  Engineer (G-0010).
- Never create a site, a key, a dataset or an app by calling the service yourself; start
  the workflow.
- Never write the backend's address, or anything a workflow's log showed you, into the
  project.
- Before removing anything of a project, tell the Engineer in chat exactly what will be
  deleted and wait for a yes.
