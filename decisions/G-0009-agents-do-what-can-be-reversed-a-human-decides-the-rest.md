---
id: G-0009
title: "Agents may do anything that can be reversed; anything irreversible or that costs money needs a human"
description: "Agents may record decisions and merge green pull requests; what can't be reversed or costs money needs the Engineer for technical matters and the Requester for their own content, and irreversible includes deleting data or backups, making private data public and sending messages to people."
status: Accepted            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.1.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: []
replaced_by: []
tags: [process]
---

# Context

Asking a human about everything makes the team useless; asking about nothing makes it
dangerous. The line has to be one an agent can apply by itself in the middle of a task.

# Decision

- **Agents may do anything that can be reversed,** including recording decisions and
  merging green pull requests.
- **Anything that can't be reversed, or that costs money, needs a human:**
  - the **Engineer** for technical matters: infrastructure, data stores, access, money,
    outside services;
  - the **Requester** for irreversible actions on their own content.
- **Irreversible includes:** deleting data or backups, making private data public, and
  sending messages to people.

# Rationale

Reversibility is a test an agent can apply without judging importance: a wrong decision
record or a wrong merge is fixed by the next pull request, a deleted backup is not. Splitting
the human side by what is at stake keeps engineering questions away from Requesters.

# Consequences

- Most work never waits for anyone.
- What does wait is made visible through G-0010 and G-0013.
- Tools that can do irreversible things build the question in (G-0022).

# Guidance for agents

- Before acting, ask: can this be undone by a later change, and is it free? If both, go on.
- If not, stop that part, raise it with the right human, and continue with the rest.
- When unsure whether something can be reversed, treat it as irreversible.
