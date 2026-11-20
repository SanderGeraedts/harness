---
id: D-0005
title: "Addresses use slugs made from titles"
description: "A record's address is a slug made from its title, unique on the device, kept when the title still fits, and remembered after a rename so old addresses keep working."
status: Accepted            # Accepted | Replaced
date: __DATE__
decided_by: engineer        # engineer | requester | the agent role, e.g. architect
overrules: []               # global decisions this project sets aside, e.g. [G-0017]
replaces: []
replaced_by: []
resolves: []                # questions this answers, e.g. [Q-001]
tags: [data]
---

# Context

No internal id may appear in a URL (G-0021), and how slugs are made and kept unique is each
project's decision. Records get a generated id when they are made offline, so they need a
readable address of their own.

# Decision

- **A record's address is its slug:** `/items/<slug>`. The id is never in the path, the
  query or the hash, and is never shown.
- **The slug is made from the title** (`src/db/slug.ts`): accents stripped, lower case,
  everything but letters and digits becomes one hyphen, at most 60 characters. An empty
  result, or one that is a route (`new`), becomes `item`.
- **It is unique on the device:** a clash gets `-2`, `-3`, and so on. Slugs of deleted
  records stay taken.
- **A rename keeps the slug when the new title still makes it;** otherwise the record gets
  a new one and the old one is kept in `oldSlugs`. An old address moves to the current one.
- The write API sets slugs; screens never do.

# Rationale

A readable address tells the user where they are and survives being shared. Remembering old
slugs keeps a shared address working after a rename.

# Consequences

- Two devices can pick the same slug while offline. When sync is built, the backend settles
  it and devices take its answer (`src/sync/README.md`).
- A new kind of record needs its own slug rule or a natural key, such as a date.

# Guidance for agents

- Address every new route by slug or natural key from the start.
- Look records up by `slug`, then by `oldSlugs` (`src/routes/itemBySlug.tsx`).
- The end-to-end tests check that no address or link holds a UUID; keep that check for new
  screens.
