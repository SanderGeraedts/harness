---
id: G-0023
title: "Each project's dataset gets automatic periodic ZFS snapshots, set up when the project is created"
description: "Every project's dataset on the NAS has a periodic ZFS snapshot task from the day it is created, which replaces any manual backup before a schema change."
status: Accepted            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.1.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: []
replaced_by: []
tags: [operations]
---

# Context

A migration is proven only on an empty database before it reaches production (G-0019). A
backup taken by hand before each schema change depends on someone remembering, and blocks a
merge on a human.

# Decision

- **Each project's dataset on the NAS gets automatic periodic ZFS snapshots,** set up when
  the project is created (G-0024).
- **That replaces any manual backup before a schema change.**

# Rationale

Snapshots are cheap, instant and automatic; a recent one always exists, so no merge has to
wait for a backup. Setting them up at creation means no project runs without them.

# Consequences

- Rolling back to a snapshot is destructive and stays the Engineer's call (G-0022).
- Snapshots on the same NAS don't protect against losing the NAS; that is a separate
  decision.
- A project created before this decision needs its snapshot task added.

# Guidance for agents

- Don't ask for a manual backup before a schema change; check that the dataset's snapshot
  task exists and has run.
- An agent may take an extra snapshot before a risky change (G-0022).
- Never delete snapshots or change their schedule without the Engineer.
