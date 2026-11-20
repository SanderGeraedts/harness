---
id: D-0001
title: "What this project is for"
description: "The purpose the Engineer gave when the project was created; work that doesn't serve it needs a new decision."
status: Accepted            # Accepted | Replaced
date: __DATE__
decided_by: engineer        # engineer | requester | the agent role, e.g. architect
overrules: []               # global decisions this project sets aside, e.g. [G-0017]
replaces: []
replaced_by: []
resolves: []                # questions this answers, e.g. [Q-001]
tags: [product]
---

# Context

The project was created with `harness create` (G-0028), which asks what the project is for
before anything is built (G-0020).

# Decision

**__PROJECT_TITLE__** is for:

> __PROJECT_PURPOSE__

# Rationale

The Engineer's answer when the project was created. It is the measure for every task: the
team builds what serves this, and nothing else.

# Consequences

- The app starts as the template's example, a list of items. T-0001 replaces it with this
  project's first real screens.
- A change of purpose is a new decision that replaces this one.

# Guidance for agents

- Read a request against this purpose. When it doesn't fit, say so and ask before building.
- Don't widen the purpose yourself; propose a replacing decision.
