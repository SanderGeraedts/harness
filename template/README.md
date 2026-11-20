# __PROJECT_TITLE__

__PROJECT_PURPOSE__

An installable app that works offline: React, TypeScript and Vite, with the data on the
device only (D-0002: no backend, no sign-in, no sync). Built AI-first with the harness; start with [AGENTS.md](AGENTS.md), the decisions
in [docs/decisions/](docs/decisions/index.md) and the tasks in
[docs/tasks/](docs/tasks/index.md).

## Run it

```sh
pnpm install
pnpm run dev          # the app on demo data
pnpm run typecheck
pnpm test             # unit tests
pnpm run build
pnpm exec playwright install chromium   # once
pnpm run test:e2e     # end-to-end tests, against the build
pnpm run check        # the harness's checks: tasks, decisions, generated files
```

## Where things are

| Path | What |
| --- | --- |
| `src/db/` | the local database, the one write API every screen uses, and slugs |
| `src/routes/`, `src/components/` | the screens and their building blocks |
| `src/text.ts` | every word a user reads |
| `src/styles/app.css` | the design tokens; `/design` shows them |
| `src/seed/` | the demo data that everything but production starts with |
| `src/sync/` | what adding sync later would take |
| `src/headers.ts` | the security headers the build writes to `dist/_headers` |
| `e2e/` | end-to-end tests |
