# Decisions

Read the global decisions first (`node_modules/@sandergeraedts/harness/decisions/index.md`),
then this list, then only the records your work touches. How the registry works is in
[README.md](README.md). One line per record: `- [D-NNNN Title](file.md): one sentence`.

## Accepted

- [D-0001 What this project is for](D-0001-what-this-project-is-for.md): The purpose the Engineer gave when the project was created; work that doesn't serve it needs a new decision.
- [D-0002 The app is local-first and syncs with its backend](D-0002-the-app-is-local-first-and-syncs-with-its-backend.md): Each device keeps the full copy in IndexedDB and syncs it with the project's backend: the Engineer chose sync when the project was created. Every change goes through one write API that queues it in an outbox, which the sync engine sends; only a production build reaches the backend.
- [D-0003 The look: one accent colour, one font, the device's light or dark theme](D-0003-the-look.md): Accent __ACCENT__ and the __FONT__ font, as tokens in src/styles/app.css; light and dark follow the device; every component is shown on /design.
- [D-0004 The interface language](D-0004-the-interface-language.md): The interface is written in the language with code __LANGUAGE__, and every word a user reads lives in src/text.ts.
- [D-0005 Addresses use slugs made from titles](D-0005-addresses-use-slugs-made-from-titles.md): A record's address is a slug made from its title, unique for its owner, kept when the title still fits, and remembered after a rename so old addresses keep working; the backend settles slugs two devices picked offline, and devices take its answer.
- [D-0006 Only a signed-in account reads and writes, and only its own records; sign-up is closed](D-0006-only-a-signed-in-account-reads-and-writes-and-only-its-own-records.md): Every record on the backend has an owner, and only that account reads or changes it; nobody makes an account for themselves: the Engineer makes, changes and removes accounts in the backend's admin screen.
- [D-0007 The newest change to a record wins, and a delete is a tombstone](D-0007-the-newest-change-to-a-record-wins-and-a-delete-is-a-tombstone.md): Two devices' changes are merged per record: the one with the newest updatedAt wins, decided by the backend, which ignores a change older than what it has; a delete sets a tombstone and syncs like any other change.
- [D-0008 The backend is PocketBase, changed only by migrations, and nothing about where it runs is in the repository](D-0008-the-backend-is-pocketbase-changed-only-by-migrations.md): The backend is a PocketBase image built from backend/, whose schema changes only by migrations that are proven on an empty database before they reach production; the admin screen is never reachable from the internet, and no address, host name or key is in the repository.
- [D-0009 Only the user's own sign-out clears the device or shows the sign-in screen in place of the app](D-0009-only-the-users-own-sign-out-clears-the-device.md): A sign-in that ends by itself, because its date passed or the backend refuses it, only pauses sync: everything on the device stays and can be changed; only an explicit sign-out clears the device, after syncing and after asking when changes would be lost.
- [D-0010 After a sign-in ended, only the same account signs in again](D-0010-after-a-sign-in-ended-only-the-same-account-signs-in-again.md): After a sign-in ended the e-mail in the sign-in form is filled in and read-only, and a sign-in as any other account is refused: the data on the device belongs to the account that put it there; another account signs out first.

## Open questions

None.

## Replaced

None.

## Resolved questions

None.
