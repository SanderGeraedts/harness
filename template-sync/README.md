# __PROJECT_TITLE__

__PROJECT_PURPOSE__

An installable app that works offline and syncs between devices: React, TypeScript and
Vite, with the full copy of the data on each device and a PocketBase backend (D-0002).
Built AI-first with the harness; start with [AGENTS.md](AGENTS.md), the decisions in
[docs/decisions/](docs/decisions/index.md) and the tasks in
[docs/tasks/](docs/tasks/index.md).

## Run it

```sh
pnpm install
pnpm run dev          # the app on demo data, without sign-in or sync
pnpm run typecheck
pnpm test             # unit tests
pnpm run build
pnpm exec playwright install chromium   # once
pnpm run test:e2e     # end-to-end tests, against the build
pnpm run check        # the harness's checks: tasks, decisions, generated files
```

Only a production build that was given the backend's address signs in and syncs (G-0019).
The dev server, previews and tests never get it. The end-to-end tests of the sign-in and
sync run against a throwaway backend, which needs Docker; without it they are left out, and
CI runs them. More in [backend/README.md](backend/README.md).

## Where things are

| Path | What |
| --- | --- |
| `src/db/` | the local database, the one write API every screen uses, and slugs |
| `src/sync/` | the sync engine and what the screens know about it ([README](src/sync/README.md)) |
| `src/auth/` | signing in and out |
| `src/routes/`, `src/components/` | the screens and their building blocks |
| `src/text.ts` | every word a user reads |
| `src/styles/app.css` | the design tokens; `/design` shows them |
| `src/seed/` | the demo data that everything but production starts with |
| `src/headers.ts` | the security headers the build writes to `dist/_headers` |
| `backend/` | the backend's image: schema, hooks, tests ([README](backend/README.md)) |
| `e2e/` | end-to-end tests; `e2e/production/` for the sign-in and sync |
