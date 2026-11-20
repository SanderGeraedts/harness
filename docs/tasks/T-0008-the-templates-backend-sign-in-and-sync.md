---
id: T-0008
title: "Give the template a backend, sign-in and sync, chosen with create --sync"
description: "harness create --sync (the default) adds a PocketBase backend folder with its publish workflow, a sign-in screen and the sync engine to the new project; --no-sync leaves the app local-only; the backend image and sync are tested in the harness's CI against a throwaway backend."
status: Doing               # Open | Doing | Done | Dropped
depends_on: [T-0003]        # tasks that must be Done first
decisions: [G-0011, G-0015, G-0017, G-0018, G-0019, G-0020, G-0021, G-0026]
raised_on: 2026-11-20
done_on: ""
result: ["https://github.com/SanderGeraedts/harness/pull/13"]                  # PR URLs
---

# Goal

Slice 2 of T-0004, whose *Notes* hold the architecture; read them first.

Offline-first with sync is the default suggestion for a new project (G-0020). After this
task `harness create` offers the choice, and a project that takes it is complete: its app
signs in and syncs, and its repository builds the backend image that spin-up (T-0004) will
run.

- **`create --sync | --no-sync`.** Asked in a terminal ("Sync between devices? [yes]"),
  default yes. The answer is recorded in the new project's decisions.
- **With sync,** the project also gets:
  - `backend/`: a PocketBase image with the schema and hooks baked in, a smoke test, and
    `funnel.json`, the paths the internet may reach;
  - a `backend` workflow that tests the image on an empty database and publishes it from
    `main`, and the auto-merge caller that starts it after a backend change (G-0011);
  - a sign-in screen and a session, in `src/auth/`;
  - the sync engine, in `src/sync/`, started only in a production build that was given a
    backend address (G-0019).
- **Without sync,** the project is what `create` makes today, without the task that says to
  add a backend.

# Done when

1. `pnpm test`, `pnpm run self-test` and `pnpm run check` pass. The self-test creates two
   projects with `--no-github`, one with `--sync` and one with `--no-sync`, and in each:
   install, type-check, unit tests, build and `harness check` pass. The `--no-sync` project
   has no `backend/`, `src/auth/` or `backend.yml`, and no `pocketbase` dependency.
2. **The backend, in the harness's CI.** A new job builds the `--sync` project's image,
   starts it on an empty database, and runs:
   - the smoke test: every collection exists; sign-up is closed; a signed-out visitor and
     another account read and write nothing of an owner's; an older change doesn't
     overwrite a newer one; two items given the same slug end up with different ones; CORS
     answers the app's origin only;
   - the app's backend tests: two clients of one account, each with changes made offline,
     end up with the same items after syncing, tombstones included.
3. **The end-to-end tests** of the `--sync` project pass (`node scripts/self-test.mjs
   --e2e`): on seeded data the app shows no sign-in screen and the band "Demo data · sync
   is off"; a production build with a backend address shows the sign-in screen, and after
   signing in against the throwaway backend an item made on one page appears on another.
4. **Only production.** A build with `CONTEXT=deploy-preview` and `BACKEND_URL` set holds
   neither the address nor the sign-in screen, and its `_headers` allows `connect-src
   'self'` only. A build with `CONTEXT=production` and the address holds it, and its
   `_headers` adds that origin to `connect-src` and nothing else.
5. **Nothing identifying.** The created project holds no address, tailnet name or dataset
   path; `backend/` and its README say where such values live instead (G-0026).
6. The UX designer has reviewed the built screens at 320px, in light and dark.
7. `v0.5.0` is tagged on a green `main`.

For a user, from the *Design*; each is an end-to-end or component test unless it names who
looks:

8. **Signed out,** a production build with an address shows the sign-in screen at every
   address and nothing of the app. A wrong password, an empty field and a backend that
   can't be reached each give their own sentence from `text.ts`, and none clears the
   e-mail.
9. **Signing out** syncs first. With everything synced it empties the device's database and
   shows the sign-in screen. With a change that can't sync it asks first, naming the
   number; "Cancel" leaves every item and the outbox as they were, "Sign out anyway"
   empties the device.
10. **A sign-in that ended,** with the device offline or online, never puts the sign-in
    screen in place of the app: an item can still be made and changed, the sync line reads
    "Sign in again to sync" and leads to `/account`, and after signing in there the waiting
    changes reach the backend.
11. **The sync line** shows each of its six states with the words of the design, the count
    in singular and plural; the details show the last sync, the last error and "Sync now".
    The storage line shows only when the browser refused persistent storage.
12. **Outside production** there is no "Account" link and `/account` is "Not found".
13. **No screen is wider than the phone** at 320px with the values named under *Long text*:
    the width tests of T-0003 also cover the sign-in screen, the account screen in both
    states, the sign-out question and the open sync details.
14. Every new component is on `/design` in each of its states, and every new word is in
    `src/text.ts`.

# Notes

## How the template is put together

- `template/` stays the app without sync. A new folder, `template-sync/`, holds what sync
  adds and the files it replaces; `create` copies it over the base when the project syncs.
  Add it to `files` in `package.json`.
- Files that differ between the two (the entry point, `src/sync/README.md`, the project's
  D-0002, its first tasks, the auto-merge caller, `package.json`'s dependencies) exist in
  both; nothing is patched line by line.
- The content security policy moves, for both, from `netlify.toml` to a `_headers` file
  written into `dist/` at build time, so a production build can add the backend's origin
  without the address being in the repository.

## What the template decides, recorded as the new project's decisions

A project can replace any of these later; they are the starting point, and each becomes a
`D-NNNN` record in `template-sync/docs/decisions/`.

- **Who may read and write:** only a signed-in account, and only its own records. Every
  record has an owner. Sign-up is closed; the Engineer makes accounts in the admin screen.
- **How two devices' changes are merged:** per record, the newest `updatedAt` wins. A
  delete is a tombstone and syncs like any change. The backend ignores a change that is
  older than what it has.
- **Slugs** two devices picked offline are settled by the backend: the second gets a
  number, and the device takes the backend's answer (the project's D-0005).
- **The backend:** PocketBase, schema changes only as migrations, proven on an empty
  database before they reach production (G-0019); the admin screen and the superusers are
  never among the Funnel paths.

## The backend folder

- `Dockerfile`: a pinned PocketBase image, with `pb_migrations/` and `pb_hooks/` copied in,
  and the label that links the image to the repository.
- Migrations: the users collection with sign-up closed, the example `items` collection with
  the fields the app's records have, owner-only rules, and rate limits on.
- Hooks: the newest-wins guard and the slug rule.
- `funnel.json`: the health check, the users collection and the items collection. T-0004
  reads it and refuses anything outside `/api/`.
- `smoke-test.sh`, run by the workflow against a container on an empty database.
- The workflow is a caller of a reusable `backend.yml` in the harness: build, start on an
  empty database, smoke test, the app's backend tests, and on `main` publish
  `ghcr.io/<owner>/<name>-backend` as `:stable` and `:sha-<commit>`.

## The app

- The engine does what `template/src/sync/README.md` lists: send the outbox in order, pull
  what changed since the last pull straight into Dexie, newest wins, take the backend's
  slug.
- It never starts outside a production build with an address: no sign-in screen, no
  network call, the band as now.
- Tests: the engine against a fake backend in the unit tests, and against the real image in
  the backend workflow. Never against a real backend (G-0019).

## What a user sees: for the UX designer, before it is built

- The sign-in screen: e-mail and password, a wrong password, no connection.
- Signed in: who is signed in and how to sign out; what happens to the data on the device
  after signing out.
- How the app shows what has and hasn't synced, and that it is working offline.
- A session that ended: the app keeps working on the device, and asks to sign in again.
- All words in `src/text.ts`; every new component on `/design`.

# Design

Everything below is for a project created with sync. A project without sync keeps the
screens of T-0003 unchanged. Phone first, one column, the existing 42rem; every state must
fit at 320px without scrolling sideways, with the longest values named under *Long text*.

## The three situations

What a user sees depends on the build and on the sign-in, and on nothing else:

| Situation | Screens | Under the header |
| --- | --- | --- |
| Not production (preview, development, tests) | the app on demo data, as now; no sign-in, no "Account" link, `/account` is "Not found" | the band "Demo data · sync is off", as now |
| Production without a backend address | the app, on this device only; no sign-in, no "Account" link | the band "Only on this device · sync is not set up", as now |
| Production with a backend address | by sign-in, below | the sync status |

In production with an address, the sign-in has three states:

- **Signed out:** nobody has signed in on this device, or somebody signed out. The device
  holds no data. Every address shows the sign-in screen.
- **Signed in:** the app, with "Account" in the header and the sync status under it.
- **Sign-in ended:** the backend no longer accepts the session, or its date passed, online
  or offline. The app stays exactly as it was: everything on the device can be read and
  changed. Only syncing stops, and the sync status asks to sign in again.

The rule behind it: **only the user's own "Sign out" ever clears the device or shows the
sign-in screen in place of the app.** A session that ends by itself never does.

## The sign-in screen (signed out)

Also the empty state of a production app before the first sign-in: there is nothing else
to show yet, and no item can be made before an account owns it.

Shown in place of every screen, at whatever address was opened; the address stays, so after
signing in the user is where they wanted to be. From top to bottom:

1. The header: the project's title with its accent bar, as now. No "Account" link and no
   sync status.
2. `AccentHeading` "Sign in".
3. A muted line: "Sign in to see your items and keep them the same on every device."
4. Only while the device says it is offline, a line in a `Card`: "You are offline. Signing
   in needs a connection." The form stays usable: a device can be wrong about being
   offline.
5. `Field` "E-mail": `type="email"`, `autocomplete="username"`, `inputmode="email"`, no
   auto-capitalising.
6. `Field` "Password": `type="password"`, `autocomplete="current-password"`.
7. The error, when there is one (below).
8. The main `Button` "Sign in", then a muted line: "No account yet? Ask whoever runs this
   app." Sign-up is closed, so there is no link to make an account or to reset a password.

States:

- **Busy:** the button reads "Signing in…" and is disabled; the fields keep their values.
- **A field is empty:** "Enter your e-mail and password." Nothing is sent; focus goes to
  the first empty field. The form has `noValidate`, like the item form, so the words are
  the project's and not the browser's.
- **Wrong e-mail or password:** "That e-mail and password don't match." The password is
  emptied and gets the focus; the e-mail stays. Never say which of the two was wrong.
- **No answer from the backend** (offline, or it can't be reached): "Couldn't reach the
  server. Check your connection and try again." Both fields keep their values.
- **Anything else** (too many tries, a fault on the backend): "Signing in didn't work. Try
  again in a moment."
- **Signed in:** the screen that belongs to the address appears, focus goes to its heading,
  and the first sync starts. Until that first sync has finished, an empty list reads
  "Fetching your items…" instead of "Nothing here yet. Add the first item."; if it fails,
  the list shows its usual empty text and the sync status says "Sync failed".

## The header, signed in or with the sign-in ended

The title stays top left. On the same line, at the right, a text link "Account" (the look
of the existing links: `linkClass`), which leads to `/account`. The title may wrap onto
more lines; "Account" never wraps and never leaves the screen. "Account" is marked
`aria-current="page"` on its own page.

## The sync status

One band under the header, where the demo band is in other builds, with the same look
(surface colour, small text). It is always there while signed in, so the page doesn't jump
when its words change. The band is one button, styled as text, that opens and closes the
details under it.

**The line.** The first rule that holds decides the words:

| When | The line |
| --- | --- |
| the sign-in ended | "Sign in again to sync", after "3 changes not synced · " when there are any. A link to `/account`, not a button; there are no details. |
| the device is offline | "Offline · 3 changes not synced", or "Offline · changes sync later" when there are none |
| the last sync failed | "Sync failed · 3 changes not synced", or "Sync failed" |
| changes wait | "3 changes not synced" ("1 change not synced") |
| the browser hasn't granted persistent storage | "Storage not protected" |
| otherwise | "All synced" |

A change is one row of the outbox. A sync that is running doesn't change the line: the
count simply drops when it is done, so the band doesn't flicker on every save.

**The details,** opened by the line, in this order:

- "Status": "3 changes not synced" or "All synced".
- "Last synced": the date and time in the project's language (`Intl.DateTimeFormat` with
  the page's language, medium date and short time), or "Not yet on this device".
- "Last error", only while the last sync failed: "Couldn't reach the server." or
  "Something went wrong while syncing.", and its time in muted text. Never a status code
  or a raw message from the backend.
- While offline: "You are offline. Changes stay on this device and sync when the
  connection is back."
- While storage isn't protected: "This browser may clear what is stored on this device
  when space runs low. Changes that haven't synced would be lost. Install the app to
  protect it."
- The main `Button` "Sync now". While a sync runs it reads "Syncing…" and is disabled;
  while offline it is disabled.

Label above value, one pair per row, so a long value has the whole width at 320px. The
details close with the same button, and with Escape while the focus is inside them (focus
returns to the line).

**The storage warning** shows only when the browser answered no to the request for
persistent storage, not while the answer is unknown and not in browsers without the
request. It is the lowest rule of the line on purpose: it is a risk, not something that is
going wrong now.

## The account screen (`/account`)

`AccentHeading` "Account". Under it, one of two.

**Signed in:**

1. "Signed in as `<e-mail>`." The e-mail breaks where it must.
2. A muted line: "Signing out syncs first, then removes everything from this device."
3. The `Button` "Sign out", in the `danger` look.

Pressing "Sign out":

- The button reads "Signing out…" and is disabled while the app syncs once more.
- **Everything synced:** the device is cleared (the items, the outbox, the session) and
  the sign-in screen appears at `/`, with the focus on its heading.
- **Changes remain** (offline, or the sync failed): nothing is cleared yet. The line and
  the button make way, in place and without a pop-up, like the delete question, for:
  "3 changes haven't synced. Signing out removes them from this device for good."
  ("1 change hasn't synced. Signing out removes it from this device for good."), with
  "Sign out anyway" (`danger`) and "Cancel" (`secondary`). "Cancel" brings the screen back
  as it was, with nothing lost. "Sign out anyway" clears the device and shows the sign-in
  screen.

**Sign-in ended:**

1. In a `Card`: "Your sign-in has ended. Everything on this device stays and can still be
   changed. Sign in again to sync."
2. The sign-in form, with the e-mail filled in and read-only: the data on the device
   belongs to that account, and another account must not sync it as its own. Errors and
   the busy state are those of the sign-in screen. After signing in: "Signed in as …" as
   above, and a sync starts.
3. Under the form, a muted line "Want to use another account? Sign out first." and the
   `secondary` button "Sign out". It can't sync first, so with changes waiting it goes
   straight to the question above; with none it clears the device.

Offline, this screen is the same; signing in gives "Couldn't reach the server…".

## Words, as keys in `src/text.ts`

`demoBanner` and `offlineOnly` stay as they are. New, in English; where a number or a name
is part of the sentence the key is a function, so a translation can order its own words:

```ts
account: 'Account',
signIn: 'Sign in',
signInIntro: 'Sign in to see your items and keep them the same on every device.',
signInOffline: 'You are offline. Signing in needs a connection.',
email: 'E-mail',
password: 'Password',
signingIn: 'Signing in…',
signInEmpty: 'Enter your e-mail and password.',
signInWrong: "That e-mail and password don't match.",
signInNoConnection: "Couldn't reach the server. Check your connection and try again.",
signInFailed: "Signing in didn't work. Try again in a moment.",
signInNoAccount: 'No account yet? Ask whoever runs this app.',
signedInAs: (email: string) => `Signed in as ${email}.`,
signOut: 'Sign out',
signOutHint: 'Signing out syncs first, then removes everything from this device.',
signingOut: 'Signing out…',
signOutUnsynced: (n: number) =>
  n === 1
    ? "1 change hasn't synced. Signing out removes it from this device for good."
    : `${n} changes haven't synced. Signing out removes them from this device for good.`,
signOutAnyway: 'Sign out anyway',
signInEnded: 'Your sign-in has ended. Everything on this device stays and can still be changed. Sign in again to sync.',
otherAccount: 'Want to use another account? Sign out first.',
fetchingItems: 'Fetching your items…',
sync: 'Sync',
syncAllSynced: 'All synced',
syncChanges: (n: number) => (n === 1 ? '1 change not synced' : `${n} changes not synced`),
syncOffline: 'Offline',
syncOfflineIdle: 'Offline · changes sync later',
syncFailed: 'Sync failed',
syncSignInAgain: 'Sign in again to sync',
syncStorage: 'Storage not protected',
syncStatusLabel: 'Status',
syncLast: 'Last synced',
syncNever: 'Not yet on this device',
syncLastError: 'Last error',
syncErrorNoConnection: "Couldn't reach the server.",
syncErrorOther: 'Something went wrong while syncing.',
syncOfflineDetail: 'You are offline. Changes stay on this device and sync when the connection is back.',
syncStorageDetail: "This browser may clear what is stored on this device when space runs low. Changes that haven't synced would be lost. Install the app to protect it.",
syncNow: 'Sync now',
syncing: 'Syncing…',
```

Two parts of a line are joined with " · ", as in the existing band.

## Components

Reused as they are: `AccentHeading`, `Button` (`primary`, `secondary`, `danger`), `Field`,
`inputClass`, `Card`, `linkClass`.

New, each shown on `/design` in every state, from fixed sample values and without a
backend:

- **`Band`** (in `ui.tsx`): the strip under the header. The demo band and the "only on this
  device" band become a `Band` too, so all three look the same.
- **`SyncStatus`**: the line and its details. On `/design`: all synced, changes waiting,
  offline, failed, storage not protected, sign in again, and one with the details open.
- **`SignInForm`**: used by the sign-in screen and by the account screen. On `/design`:
  empty, with an error, busy, and with the read-only e-mail.
- **`SignOut`**: the line, the button and the question. On `/design`: at rest and with the
  question.

## Keyboard and screen reader

- **Order:** the title, "Account", the sync line, then the page. Everything is a real link
  or button; nothing depends on hover.
- **Labels:** each field has its visible label through `Field`. The form is named
  "Sign in"; the band is a region named "Sync".
- **The sync line** has `aria-expanded` and `aria-controls` for its details.
- **Status changes:** the region holds a visually hidden `role="status"` element that says
  the line when its *rule* changes ("Offline", "Sync failed", "All synced", "Sign in again
  to sync", "Storage not protected"), without the count, so saving ten items isn't read
  out ten times. The count itself is read when the user reaches the line.
- **Errors** of the sign-in form are `role="alert"`, tied to the form with
  `aria-describedby`. The offline line on the sign-in screen and the "sign-in has ended"
  card are `role="status"`.
- **The sign-out question** is `role="alert"`, and the focus moves to "Cancel", the safe
  answer. After "Cancel" the focus returns to "Sign out".
- **Busy buttons** are disabled and say what they are doing in their own text.
- **Focus after a change of screen:** to the heading of the new screen (signed in, signed
  out), which takes focus without being in the tab order.
- **Contrast and motion:** only existing tokens, so the existing contrast holds in light
  and dark; nothing spins or moves. No state is told by colour alone: every state has its
  words.

## Long text and small screens

To be looked at at 320px, in light and dark, with: a 60-character title in the header next
to "Account"; an e-mail of 60 characters without a hyphen; 1 and 1,234 changes waiting;
every line of the sync status and the open details; the sign-out question; and the
sign-in screen with the offline line and an error at once. Buttons that stand side by side
wrap under each other before they are cut off.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.

- 2026-11-20 architect: raised as slice 2 of T-0004. Decided what the template starts
  with: owner-only access with sign-up closed, newest change wins per record, slugs settled
  by the backend. Handed to the UX designer for the sign-in and sync screens; nothing waits
  on a question.
- 2026-11-20 ux-designer: designed the sign-in screen, the account screen with sign-out, the
  sync status and what a user sees when a sign-in ended (under *Design*), and added what
  must hold for a user to *Done when* (8 to 14). Status to Doing. For the architect, to
  record with the project's decisions: only the user's own sign-out clears the device, and
  after a sign-in ended only the same account signs in again without signing out first.
  Handed to the developer.
