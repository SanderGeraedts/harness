# AGENTS.md

The harness: an AI-first way of working that projects install. A registry of global
decisions, rules for agents, an agent team, scripts and reusable GitHub workflows. This file
is for working on the harness itself; what projects read is [rules/AGENTS.md](rules/AGENTS.md).

## Before you change anything

1. Read [decisions/index.md](decisions/index.md), then the records your change touches.
2. Work from a task in [docs/tasks/index.md](docs/tasks/index.md), one task per session.
3. Read [rules/AGENTS.md](rules/AGENTS.md): the harness works by its own rules.

## Rules

- **Never name a project that uses the harness, and never a person.** Not in code, records,
  tasks, tests, commits or pull requests. Only the roles **Engineer** and **Requester**.
  No employer, host name, network name, address or storage pool name either. The licence's
  copyright line and the repository's own name are the only exceptions.
- **A pull request that touches `decisions/` waits for the Engineer** (G-0006). The
  auto-merge workflow labels it instead of merging; never merge it yourself. Every other
  green pull request that isn't a draft merges itself.
- **Global decisions are replaced, never edited** ([decisions/README.md](decisions/README.md)).
  A new or replaced record sets `since` or `changed` to the version that will carry it.
- **Every change goes through a pull request.** Never push to `main` and never skip git
  hooks. Run `git config core.hooksPath .githooks` once after cloning. After a merge the
  auto-merge workflow starts CI on `main`, because a merge made with `GITHUB_TOKEN` starts
  no push workflows.
- **Everything a project receives is tested here** (G-0015). A new command or generated
  file gets a unit test and a step in `scripts/self-test.mjs`, in the same pull request.
- **No build step and no install script:** projects use the package as checked in. Keep
  runtime dependencies to what the NAS tool needs.
- **Changing what `harness sync` writes changes every project** on its next update. Say so
  in the pull request.
- **Use pnpm:** `pnpm install`, `pnpm test`, `pnpm run self-test`, `pnpm run check`.
- **Keep task status current:** status, Log and `result` move in the same pull request as
  the work; regenerate the index with `pnpm run tasks:index`.
- **Prove your work.** Run the task's check and report its actual output.

## Releasing

A release is a tag `vX.Y.Z` on a green `main` commit whose `package.json` has that version.
Projects pin the dependency and the reusable workflows to the tag, so a tag is never moved.
