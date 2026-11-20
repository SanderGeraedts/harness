---
id: G-0017
title: "A new project's front end is React, TypeScript and Vite, with TanStack Router, Tailwind, Vitest, Playwright, vite-plugin-pwa and Dexie"
description: "New projects start as a static single-page app in React and TypeScript built with Vite, routed with TanStack Router, styled with Tailwind, tested with Vitest and Playwright, installable through vite-plugin-pwa, and storing local data in IndexedDB through Dexie."
status: Accepted            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.1.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: []
replaced_by: []
tags: [stack]
---

# Context

Every new project needs a front-end stack, and choosing one each time costs a discussion
and gives projects that can't share knowledge, checks or a template (G-0024).

# Decision

A new project starts with:

- **React + TypeScript + Vite**, as a static single-page app;
- **TanStack Router** for routing;
- **Tailwind** for styling;
- **Vitest** for unit tests and **Playwright** for end-to-end tests;
- an **installable PWA** with **vite-plugin-pwa**;
- **Dexie** for local data.

Each of these can be overruled per project (G-0002).

# Rationale

A static app is cheap to host and preview, works offline once installed, and suits local
data with sync (G-0020). One stack across projects means the team's rules, the CI workflow
and the project template fit all of them.

# Consequences

- The reusable CI workflow assumes pnpm scripts for type-checking, tests and the build.
- A project that needs something else (server rendering, another framework) records an
  overrule and may need its own checks.

# Guidance for agents

- Start a new project from this stack; don't add a second library for a job one of these
  already does.
- Replacing one of them in an existing project is an overruling decision, not a refactor.
