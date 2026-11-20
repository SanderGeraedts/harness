# AGENTS.md

<One or two sentences: what this project is and who it is for.>

Built AI-first with the harness: agents write the code, working from recorded decisions and
tasks.

## Before you change anything

1. Read the rules: `node_modules/@sandergeraedts/harness/rules/AGENTS.md`. They apply here
   in full. If that file is missing, run `pnpm install` first.
2. Run `pnpm exec harness role`, and work in the mode it prints.
3. Read the global decisions (`node_modules/@sandergeraedts/harness/decisions/index.md`),
   then this project's ([docs/decisions/index.md](docs/decisions/index.md)). A project
   decision with `overrules` wins over the global decision it names.
4. Work from a task in [docs/tasks/index.md](docs/tasks/index.md).

## Project rules

Rules that hold only for this project. Each one points at the decision behind it.
