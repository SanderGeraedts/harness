---
id: D-0003
title: "The look: one accent colour, one font, the device's light or dark theme"
description: "Accent __ACCENT__ and the __FONT__ font, as tokens in src/styles/app.css; light and dark follow the device; every component is shown on /design."
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

A project's look is chosen per project (G-0020), and there is no global design system. The
Engineer chose an accent colour and a font when the project was created; the rest is the
template's neutral starting point.

# Decision

- **Accent colour: `__ACCENT__`.** It marks what matters: the bar under headings, the main
  button, links and the focus ring. Text on the accent is `__ON_ACCENT__`.
- **Font: __FONT__** (`__FONT_STACK__`). No font files are downloaded.
- **Light and dark follow the device** (`prefers-color-scheme`); there is no switch.
- **Every colour, radius and font is a token** in `src/styles/app.css`, used through
  Tailwind utilities. Components live in `src/components/ui.tsx`.
- **`/design` shows every token and component,** in every build but production.
- The app icon is drawn from the accent by `scripts/make-icons.mjs`.

# Rationale

Tokens in one file make the look changeable in one place, and a page that shows everything
lets the UX designer and the Requester judge it without clicking through the app.

# Consequences

- The neutral greys and the status colours are the template's; the UX designer may replace
  them with a decision that replaces this one.
- A new accent colour needs its text colour checked for contrast, and the icons redrawn
  (`pnpm run icons`).

# Guidance for agents

- Use tokens only: no colour, radius or font written out in a component.
- When you add a component, add it to `/design`.
- Check a new screen in both light and dark.
