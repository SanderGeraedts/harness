---
id: Q-001
title: "How does the NAS pull a private project's backend image?"
description: "New repositories are private, so their backend image is private too; the NAS needs either a read-only pull token, held with the other secrets, or the image made public."
status: Open                # Open | Resolved
raised_on: 2026-11-20
raised_by: architect        # the agent role, or engineer
issue: "https://github.com/SanderGeraedts/harness/issues/10"
blocks: [T-0004]            # what waits on it, e.g. [T-0012]
resolved_by: []             # the decision that answers it, e.g. [D-0004]
tags: [operations]
---

# Question

A project that syncs builds its backend image in its own repository and publishes it to
GitHub's container registry. The app on the NAS pulls that image, and pulls it again each
time a backend change is published (T-0004).

New repositories are private by default (G-0029). An image published from a private
repository is private as well, and the NAS can't pull a private image without signing in.

So spin-up of a private project needs one of two things, and both are the Engineer's:

- a credential the NAS signs in with: a new secret, and a new way in to private packages;
- or the image made public: making something private public, which can't be taken back
  (G-0009).

It matters now because it is the one step of spin-up that the four secrets in the
environment don't cover (G-0026).

What the image holds: PocketBase itself and the project's migrations and hooks, so its
schema and its access rules. No data, no account, no address and no secret.

# Options

**A. A read-only pull token, as a fifth secret.**

- The Engineer makes a token whose only right is reading packages, and adds it to the
  environment of the private infrastructure repository, next to the other four.
- Spin-up gives it to the project's app on the NAS, for pulling that project's image.
- Private stays private.
- The token can read every package the account can read, not one project's; it is stored in
  each such app's configuration on the NAS; and when it expires, pulling stops until the
  Engineer makes a new one and the apps are updated (one workflow run per project).

**B. The backend image is public, also for a private repository.**

- Spin-up makes the image public after it is first published. No secret, nothing to renew.
- Anyone can read the project's schema and access rules. For most projects that gives
  little away, but it can't be taken back once pulled, and it is decided for every project
  at once.

**C. A for a private repository, and no token once the repository is public.**

- As A. When the Engineer makes a repository public, its image becomes public with it, and
  the next spin-up run takes the token out of that project's app.
- Nothing becomes public that the Engineer didn't make public.

**Recommended: C.** It never publishes anything on its own, and costs one token made by
hand, once. If the Engineer would rather have no fifth secret, B works and is simpler; then
`create` should say plainly, before it starts, that the image will be public.

Either way nothing is built differently until the answer: T-0007 and T-0008 don't touch
this, and in T-0004 only the pull itself waits.

# Answer

Empty while open.
