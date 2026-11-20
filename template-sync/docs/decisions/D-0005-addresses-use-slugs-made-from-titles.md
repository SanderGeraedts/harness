---
id: D-0005
title: "Addresses use slugs made from titles"
description: "A record's address is a slug made from its title, unique for its owner, kept when the title still fits, and remembered after a rename so old addresses keep working; the backend settles slugs two devices picked offline, and devices take its answer."
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
readable address of their own. The app syncs (D-0002), so two devices can pick the same
slug before either has heard of the other.

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
- **The backend settles what two devices picked** (`backend/pb_hooks/slugs.pb.js`): on
  every save it makes the slug unique among its owner's records, deleted ones included, and
  counts earlier slugs as taken. The second device's `tea` becomes `tea-2`. The device
  takes the backend's slug from its answer, without a new `updatedAt` and without a new
  change to send.
- The write API and the backend set slugs; screens never do.

# Rationale

A readable address tells the user where they are and survives being shared. Remembering old
slugs keeps a shared address working after a rename. One place that decides a clash, the
backend, means every device ends up with the same address for the same record.

# Consequences

- An address a device made offline can change once, when that device first syncs and the
  backend had the slug already. The old address then leads nowhere on other devices; on
  the device itself the page moves on with the record.
- The slug rule exists twice, in `src/db/slug.ts` and in `backend/pb_hooks/slug.js`. A test
  (`src/sync/slug-rule.test.ts`) keeps them the same.
- Until its first sync a device can briefly hold two records with one slug: its own, and
  one it fetched. The push that follows settles it.
- A new kind of record needs its own slug rule or a natural key, such as a date, on the
  device and on the backend.

# Guidance for agents

- Address every new route by slug or natural key from the start.
- Look records up by `slug`, then by `oldSlugs` (`src/routes/itemBySlug.tsx`).
- Change the slug rule in both places at once, and never in a migration that has run.
- The end-to-end tests check that no address or link holds a UUID; keep that check for new
  screens.
