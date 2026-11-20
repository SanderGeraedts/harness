# Tasks

Generated from the task files by `harness tasks-index`; don't edit by hand (G-0012).
One file per task, from [_template.md](_template.md). Pick from *Open* a task whose
`depends_on` are all Done. One task per session.

## Open

- [T-0006 Tidy what the testers of T-0005 and T-0003 found](T-0006-tidy-what-the-testers-of-t-0005-and-t-0003-found.md): Small defects in adopt, init, create and the auto-merge workflow that the testers listed and that blocked neither task.
- [T-0007 Generate the private infrastructure repository, install the runner on the NAS, and run harness nas through a workflow](T-0007-the-infrastructure-repository-the-runner-and-nas-by-workflow.md): harness infra init generates the thin private infrastructure repository, harness infra runner installs a self-hosted runner as an app on the NAS, and harness nas --remote calls the TrueNAS API through a workflow there, with the key from the GitHub environment; released as 0.4.0 with the rules for G-0026 to G-0029.

## Doing

- [T-0004 Spin up hosting and the backend, with automatic snapshots](T-0004-spin-up-hosting-and-backend.md): harness create also starts workflows in the private infrastructure repository that create the Netlify site and, for a project that syncs, a PocketBase app on the NAS with its own Funnel address and snapshot task; harness infra down removes a project again, after the Engineer's yes.
- [T-0008 Give the template a backend, sign-in and sync, chosen with create --sync](T-0008-the-templates-backend-sign-in-and-sync.md): harness create --sync (the default) adds a PocketBase backend folder with its publish workflow, a sign-in screen and the sync engine to the new project; --no-sync leaves the app local-only; the backend image and sync are tested in the harness's CI against a throwaway backend.

## Done

- [T-0001 Build the harness repository](T-0001-build-the-harness-repository.md): The global registry, the rules, the roles, the agent team, the harness command and the reusable workflows, tested on itself and released as v0.1.0.
- [T-0002 The first project adopts the harness](T-0002-the-first-project-adopts-the-harness.md): An existing project that already works this way installs the harness at a tag, moves its process rules and process decisions to the global registry, and runs on the reusable workflows.
- [T-0003 Spin up a repository and app from one prompt](T-0003-spin-up-a-repository-and-app.md): A command the Engineer runs that creates a new repository with the app from the default stack, the harness installed and initialised, CI and auto-merge wired, and the default branch protected.
- [T-0005 Close the gaps found in the first adoption](T-0005-close-the-gaps-found-in-the-first-adoption.md): Let a project decision be replaced by a global one, let a project add to its generated registry README, give the reusable CI artifact options, and add an adopt path for repositories that already have registries.
- [T-0009 Make the browser install in CI fast and steady](T-0009-make-the-browser-install-in-ci-fast-and-steady.md): Install Playwright's Chromium without the system package step and cache it, in the reusable CI and in the harness's own template-e2e job, because that step took from 30 seconds to over six minutes.

## Dropped

None.
