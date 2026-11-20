---
id: G-0003
title: "Personal details may be redacted from records in place; what was decided never changes"
description: "Names of people, employers and private details can be removed from decisions, questions, tasks and docs without a replacing record, as long as the substance stays the same; the redactions are listed in the pull request."
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

Records are never edited (G-0001), but they are written in the middle of work and sometimes
name a person, an employer or a private circumstance that should not stay in a repository,
least of all a public one.

# Decision

- Personal details may be removed from any record, or replaced by neutral wording such as a
  role, by editing the record in place.
- The substance (what was decided, why, and what follows from it) must stay exactly the same.
- The pull request lists which records were redacted. In the global registry the record's
  `changed` field is set to the version that carries the redaction.
- The harness itself never names a person or a project: only the roles Engineer and
  Requester.

# Rationale

A replacing record would keep the detail in the old one, which defeats the point. Limiting
the exception to details that don't carry the decision keeps the rule that decisions don't
change.

# Consequences

- History still holds the old wording; removing it from history is a separate, irreversible
  step for the Engineer.
- Records should be written with roles instead of names from the start.

# Guidance for agents

- Write roles, not names, in records, tasks, commits and pull requests.
- When redacting, change no more than the personal detail, and list it in the pull request.
- If removing the detail would change what the record means, stop and ask the Engineer.
