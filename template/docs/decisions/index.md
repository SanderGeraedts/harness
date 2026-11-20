# Decisions

Read the global decisions first (`node_modules/@sandergeraedts/harness/decisions/index.md`),
then this list, then only the records your work touches. How the registry works is in
[README.md](README.md). One line per record: `- [D-NNNN Title](file.md): one sentence`.

## Accepted

- [D-0001 What this project is for](D-0001-what-this-project-is-for.md): The purpose the Engineer gave when the project was created; work that doesn't serve it needs a new decision.
- [D-0002 The app is local-first and ready to sync](D-0002-the-app-is-local-first-and-ready-to-sync.md): Each device keeps the full copy in IndexedDB; every record has updatedAt and a tombstone, and every change goes through one write API that also queues it in an outbox; sync itself comes with the backend.
- [D-0003 The look: one accent colour, one font, the device's light or dark theme](D-0003-the-look.md): Accent __ACCENT__ and the __FONT__ font, as tokens in src/styles/app.css; light and dark follow the device; every component is shown on /design.
- [D-0004 The interface language](D-0004-the-interface-language.md): The interface is written in the language with code __LANGUAGE__, and every word a user reads lives in src/text.ts.
- [D-0005 Addresses use slugs made from titles](D-0005-addresses-use-slugs-made-from-titles.md): A record's address is a slug made from its title, unique on the device, kept when the title still fits, and remembered after a rename so old addresses keep working.

## Open questions

None.

## Replaced

None.

## Resolved questions

None.
