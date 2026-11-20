---
id: G-0027
title: "Agents manage the NAS only through the harness's TrueNAS tool, run by workflows on a runner on the NAS; destructive calls need a human's yes"
description: "Agents manage the NAS only with harness nas, which normally runs in a workflow of the private infrastructure repository on a self-hosted runner on the NAS, with the key from the GitHub environment and a pinned certificate; destructive calls need --confirmed and a human's yes, and creating a snapshot is not destructive."
status: Accepted            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.4.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: [G-0022]
replaced_by: []
tags: [operations]
---

# Context

The backend of every project runs on one NAS (G-0018). Agents need to deploy, update and
inspect apps there, but the same access can destroy every project's data at once.

G-0022 gave agents one tool for this, `harness nas`, with the key in the Engineer's
environment on a machine at home. The secrets have since moved to a GitHub environment
(G-0026), and the NAS's API answers only on the home network, so a workflow needs a way to
reach it. Two were weighed:

- **A self-hosted GitHub Actions runner as an app on the NAS,** registered to the private
  infrastructure repository. Jobs run on the home network and call the API directly.
- **A GitHub-hosted runner that joins the tailnet.** This needs the NAS itself on the
  tailnet first, set up by hand, and makes managing the NAS depend on the tailnet.

# Decision

- **Agents manage the NAS only through `harness nas`,** which calls the TrueNAS API.
- **It normally runs in a workflow of the private infrastructure repository** (G-0026), on
  a **self-hosted runner that is an app on the NAS,** registered to that repository only.
  - The key comes from the GitHub environment, for the length of a job.
  - The NAS's address and its certificate's fingerprint are in the runner's own
    configuration on the NAS, and nowhere else.
  - The tool sends the key only after the certificate matches the pinned fingerprint.
  - The runner gets no access to the NAS beyond the API: no container socket and no
    datasets other than its own.
- **The runner is installed once,** from a session with the Engineer on the home network,
  with `harness nas` run locally and a short-lived registration token that is never shown.
- **Running `harness nas` locally stays possible** for an Engineer who has the key in their
  environment on the home network (`TRUENAS_HOST`, `TRUENAS_API_KEY`,
  `TRUENAS_CERT_SHA256`), but nothing requires it after the runner is installed.
- **Destructive calls need `--confirmed` and a human's yes,** whichever way the tool runs.
  The tool refuses a destructive method without the flag; Claude Code asks a human before
  any command that carries it (a permission rule written by `harness sync`), and the
  workflow passes the flag on only when it was given. Destructive covers deleting or
  overwriting data, datasets, disks and apps; rolling back, deleting or cloning snapshots;
  anything about users, keys, certificates, sign-in and the network; reboot, shutdown and
  OS updates.
- **Creating a snapshot is not destructive** and runs without asking.

# Rationale

One tool with the list of dangerous methods built in is a guard that doesn't depend on each
agent's judgement, and it is the same guard in a workflow as on a machine. The runner on the
NAS was chosen over the tailnet because it needs no setting-up by hand beyond its own
install, keeps managing the NAS independent of the tailnet, and doesn't put the NAS's
management on a network that other devices share. Only the Engineer can start a job on it:
the repository is private. Keeping the address and the fingerprint on the runner means no
repository and no GitHub setting names the NAS. Snapshots are how a risky change is made
safe, so taking one must never be discouraged by a prompt.

# Consequences

- NAS work is started from a session with the Engineer, on any machine; only the runner's
  first install has to happen at home.
- A process on the NAS runs what the private infrastructure repository's workflows say.
  Whoever can write to that repository can reach the NAS's API; it has one owner and its
  workflows come from the harness at a pinned tag.
- When the runner is down, NAS work waits, or the Engineer runs the tool locally at home.
- The `--confirmed` prompt is a guard for agents, not a security boundary.
- A new destructive API method must be added to the tool's list.
- The route can be changed later without touching a project: only the infrastructure
  workflows and the runner know it.

# Guidance for agents

- Never reach the NAS another way (SSH, the web UI through a browser tool, another client).
- Before a `--confirmed` call, also one that starts a workflow, tell the Engineer in chat
  exactly what will happen and wait for a yes.
- Take a snapshot before any risky change.
- Never print, log outside the private infrastructure repository's runs, or commit the key,
  the host or the fingerprint.
- Don't give the runner more than it has: no container socket, no other dataset, no second
  repository.
