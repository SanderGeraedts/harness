---
id: G-0030
title: "A private project's backend image is pulled with a read-only token; a public project's image is public and needs none"
description: "While a project's repository is private, the NAS pulls its backend image with a token that may only read packages, held as a fifth secret in the infrastructure environment; when the Engineer makes the repository public, its image becomes public with it and spin-up removes the token from that project's app."
status: Accepted            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.7.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: []
replaced_by: []
tags: [operations]
---

# Context

A project that syncs publishes its backend image to GitHub's container registry, and the
app on the NAS pulls it (G-0028). New repositories are private (G-0029), so their images are
private too, and the NAS can't pull a private image without signing in. The harness's own
question Q-001 asked how; the Engineer answered option C on 2026-11-20.

# Decision

- **Private repository:** the NAS pulls the image with a token whose only right is reading
  packages. The Engineer makes it by hand and stores it as the secret `GHCR_PULL_TOKEN` in
  the infrastructure environment (G-0026), next to the other four. Spin-up gives it to that
  project's app on the NAS, for pulling only.
- **Public repository:** when the Engineer makes a repository public, its image is made
  public with it, and the next spin-up run removes the token from that project's app.
- Nothing is made public that the Engineer didn't make public.

# Rationale

Private stays private without publishing anything on the harness's own initiative, which
G-0009 reserves for a human. One token made once covers every private project.

# Consequences

- The token can read every package the account can read, not one project's, and it is
  stored in each private project's app configuration on the NAS.
- When it expires, pulling stops until the Engineer makes a new one; updating the apps is
  one workflow run per project.

# Guidance for agents

- Never print, log or commit the token; workflows read it from the environment.
- Never make an image or a repository public. Follow the repository's visibility.
- When a repository becomes public, make its image public in the same step and remove the
  token from its app.
