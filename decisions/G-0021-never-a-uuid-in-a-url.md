---
id: G-0021
title: "Never a UUID in a URL: addresses use readable slugs"
description: "No address shows an internal id, in the path, the query or the hash; pages are addressed by readable slugs made from their names or dates."
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

Records made offline get generated ids, and the easy thing is to put those ids in the
address. Such addresses can't be read, remembered or told apart, and they show an
implementation detail to every user.

# Decision

- **No UUID or other internal id appears in a URL**: not in the path, the query or the hash.
- Addresses use readable slugs made from what the user named the thing, or from a natural
  key such as a date.
- A slug stays unique where it is used, and an address that once worked keeps working after
  a rename.

# Rationale

A readable address tells the user where they are and survives being shared or typed. Deciding
it globally means it is designed in from a project's first route.

# Consequences

- Records need a stored slug, rules for clashes, and a way to keep old addresses working.
- With sync, two devices can pick the same slug offline; the backend settles it.

# Guidance for agents

- When you add a route, address it by slug or natural key from the start.
- Never show an internal id to a user, in an address or elsewhere.
- How slugs are made and kept unique is a project decision; record it.
