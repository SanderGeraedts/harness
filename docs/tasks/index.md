# Tasks

Generated from the task files by `harness tasks-index`; don't edit by hand (G-0012).
One file per task, from [_template.md](_template.md). Pick from *Open* a task whose
`depends_on` are all Done. One task per session.

## Open

- [T-0003 Spin up a repository and app from one prompt](T-0003-spin-up-a-repository-and-app.md): A command the Engineer runs that creates a new repository with the app from the default stack, the harness installed and initialised, CI and auto-merge wired, and the default branch protected.
- [T-0004 Spin up hosting and the backend, with automatic snapshots](T-0004-spin-up-hosting-and-backend.md): Spin-up also creates the Netlify site with its subdomain and a PocketBase app on the NAS with its own Funnel address and a periodic snapshot task, using tokens that exist only in the Engineer's environment.

## Doing

None.

## Done

- [T-0001 Build the harness repository](T-0001-build-the-harness-repository.md): The global registry, the rules, the roles, the agent team, the harness command and the reusable workflows, tested on itself and released as v0.1.0.
- [T-0002 The first project adopts the harness](T-0002-the-first-project-adopts-the-harness.md): An existing project that already works this way installs the harness at a tag, moves its process rules and process decisions to the global registry, and runs on the reusable workflows.
- [T-0005 Close the gaps found in the first adoption](T-0005-close-the-gaps-found-in-the-first-adoption.md): Let a project decision be replaced by a global one, let a project add to its generated registry README, give the reusable CI artifact options, and add an adopt path for repositories that already have registries.

## Dropped

None.
