---
id: D-0004
title: "The interface language"
description: "The interface is written in the language with code __LANGUAGE__, and every word a user reads lives in src/text.ts."
status: Accepted            # Accepted | Replaced
date: __DATE__
decided_by: engineer        # engineer | requester | the agent role, e.g. architect
overrules: []               # global decisions this project sets aside, e.g. [G-0017]
replaces: []
replaced_by: []
resolves: []                # questions this answers, e.g. [Q-001]
tags: [design]
---

# Context

A project's language is chosen per project (G-0020). The Engineer chose it when the project
was created.

# Decision

- **The interface is in the language with code `__LANGUAGE__`.** The page and the app
  manifest declare it.
- **Every word a user reads lives in `src/text.ts`.** Screens and end-to-end tests take
  their text from it.
- Code, comments, decisions and tasks are in English.

# Rationale

One language keeps the app simple, and one file of text keeps it consistent and makes a
later translation a change in one place.

# Consequences

- The template's text is English. When the chosen language is another one, a task
  translates `src/text.ts` and the demo data.
- A second language would need a new decision and a way to choose between them.

# Guidance for agents

- Never write user-facing text in a component; add it to `src/text.ts`.
- Write for the people the project is for (D-0001), in plain words.
