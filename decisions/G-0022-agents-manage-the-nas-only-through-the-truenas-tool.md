---
id: G-0022
title: "Agents manage the NAS only through the harness's TrueNAS tool, and destructive calls need a human's yes"
description: "Agents manage the NAS only with harness nas, using a key that exists only in the Engineer's environment and a pinned certificate; destructive calls need --confirmed and a human's yes, and creating a snapshot is not destructive."
status: Replaced            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.1.0                # the harness version that added this record
changed: 0.4.0              # the version in which it was replaced or redacted
replaces: []
replaced_by: [G-0027]
tags: [operations]
---

# Context

The backend of every project runs on one NAS (G-0018). Agents need to deploy, update and
inspect apps there, but the same access can destroy every project's data at once.

# Decision

- **Agents manage the NAS only through `harness nas`,** which calls the TrueNAS API.
- **The key exists only in the Engineer's environment** (`TRUENAS_HOST`,
  `TRUENAS_API_KEY`, `TRUENAS_CERT_SHA256`); it is never committed or printed. The tool
  sends the key only after the NAS's certificate matches the pinned fingerprint.
- **Destructive calls need `--confirmed` and a human's yes.** The tool refuses a destructive
  method without the flag, and Claude Code asks a human before any command that carries it
  (a permission rule written by `harness sync`). Destructive covers deleting or overwriting
  data, datasets, disks and apps; rolling back, deleting or cloning snapshots; anything
  about users, keys, certificates, sign-in and the network; reboot, shutdown and OS updates.
- **Creating a snapshot is not destructive** and runs without asking.

# Rationale

One tool with the list of dangerous methods built in is a guard that doesn't depend on each
agent's judgement. Keeping the key in the Engineer's environment means a Requester's session
can't reach the NAS at all. Snapshots are how a risky change is made safe, so taking one
must never be discouraged by a prompt.

# Consequences

- NAS work happens only in a session with the Engineer, on a machine that has the key.
- The `--confirmed` prompt is a guard for agents, not a security boundary: anything running
  as the Engineer can read the key.
- A new destructive API method must be added to the tool's list.

# Guidance for agents

- Never reach the NAS another way (SSH, the web UI through a browser tool, another client).
- Before a `--confirmed` call, tell the Engineer in chat exactly what will happen and wait
  for a yes.
- Take a snapshot before any risky change.
- Never print, log or commit the key, the host or the fingerprint.
