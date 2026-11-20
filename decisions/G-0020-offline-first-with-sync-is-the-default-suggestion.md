---
id: G-0020
title: "Offline-first with sync is the default suggestion for a new project; look and language are chosen per project"
description: "For a new project the team suggests a full local copy on each device that syncs with the backend, unless that makes no sense for it; its look and its language are chosen per project."
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

The stack (G-0017, G-0018) supports an app that works without a connection, and the backend
runs on a NAS that is not always reachable. But not every project has data worth keeping on
the device, and projects are for different people.

# Decision

- **Offline-first with sync is the default suggestion** for a new project: each device keeps
  a local copy and works without a connection, and syncs with the backend when it can.
- It is a suggestion, dropped when it makes no sense for the project.
- **Look and language are chosen per project,** and recorded as project decisions.

# Rationale

An app that keeps working when the backend is away turns the NAS's limits into a detail.
Look and language depend on who the project is for, so there is no useful global default.

# Consequences

- A project that takes the suggestion needs a sync design: what wins when two devices
  change the same thing.
- The UX designer has no global design system to fall back on; the project's decisions are
  the source.

# Guidance for agents

- When a new project starts, the architect proposes offline-first with sync and records the
  choice either way.
- Ask the Requester about look and language in plain words; record the answers.
- Don't carry one project's look or language into another.
