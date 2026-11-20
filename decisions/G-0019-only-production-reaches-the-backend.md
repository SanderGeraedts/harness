---
id: G-0019
title: "Deploy previews and local development run on seeded demo data; only production reaches the backend"
description: "Previews and the local dev server use seeded demo data with the backend switched off; only the production build can reach the real backend, and CI tests against a throwaway one."
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

Previews are public addresses built from unmerged code, and agents run the app locally all
day. If either could reach the real backend, a bug or an experiment could change or expose
real data.

# Decision

- **Deploy previews and local development run on seeded demo data,** with no connection to
  the backend.
- **Only the production build reaches the real backend.**
- Tests that need a backend run against a throwaway one, created for the run on an empty
  database.

# Rationale

Making it impossible, by build configuration, for anything but production to reach real
data is safer than trusting every preview and every agent to be careful. Seeded data also
makes previews useful to look at straight away.

# Consequences

- The seed data has to be kept good enough to show every screen.
- A migration is proven only on an empty database before production; G-0023 covers the rest.

# Guidance for agents

- Never point local development, a preview, a test or CI at the real backend.
- When you add a screen or a field, add seed data that shows it.
- If a task seems to need real data outside production, stop and ask the Engineer.
