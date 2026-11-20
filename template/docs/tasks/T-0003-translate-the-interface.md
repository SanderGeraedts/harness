---
id: T-0003
title: "Translate the interface"
description: "Write the interface text and the demo data in the project's language."
status: Open                # Open | Doing | Done | Dropped
depends_on: []              # tasks that must be Done first
decisions: [D-0004, G-0019, G-0020]
raised_on: __DATE__
done_on: ""
result: []                  # PR URLs
---

# Goal

The project's interface language has the code `__LANGUAGE__` (D-0004), but the template's
text is English. Translate every string in `src/text.ts` and the demo items in
`src/seed/demo.ts`, in plain words for the people the project is for.

# Done when

- No English is left in `src/text.ts` or `src/seed/demo.ts`.
- `pnpm test`, `pnpm run build` and `pnpm run test:e2e` pass. The end-to-end tests take
  their text from `src/text.ts`; only the titles they type themselves may stay as they are.
- The Requester has read the screens and said the words are right.

# Notes

Do this with T-0001 when that replaces the screens anyway.

# Design

Nothing new to see: the same screens, in the project's language.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.
