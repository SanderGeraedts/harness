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
details under it. At its right end a small mark shows that it opens: `▾` closed, `▴` open, muted,
`aria-hidden`, never wrapping under the words (added after the first review).

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

## Review after building

UX designer, 2026-11-20, on commit `c0d641c`. **Verdict: sent back to the developer,** for
three small changes to the sync line (below). Everything else matches the design.

Looked at: the developer's screenshots at 320px, all sixteen in light and nine in dark
(the sign-in screen, the sign-in screen offline with an error, the list offline, the open
details offline, the account screen, the sign-out question, the account screen with the
sign-in ended, the list with the sign-in ended, a failed sync), and the built
`SignInScreen`, `AccountPage`, `SyncStatus`, `SignInForm`, `SignOut`, `Layout`,
`sync/line.ts` and `text.ts`. Not looked at yet: the other seven dark screenshots; they
come with the second review.

**What matches**

- **The sign-in screen:** the order, the words, the offline card above the form with the
  form still usable, the error above the button. An empty field puts the focus on the first
  empty one; a wrong password empties the password only and takes the focus.
- **The header:** a 60-character title wraps onto three lines beside "Account", which stays
  on one line and on the screen.
- **The sync line:** the order of the six rules in `sync/line.ts` is the design's, and each
  line reads as designed, with "1 change" and "1234 changes". The details stack label above
  value and show the offline and storage lines and a disabled "Sync now" offline.
- **The account screen:** the 60-character e-mail breaks over two lines; the sign-out
  question takes the place of the line and the button, with "Sign out anyway" and "Cancel"
  side by side at 320px. With the sign-in ended: the card, the read-only e-mail, the second
  "Sign out".
- **A sign-in that ended** leaves the list as it was, with the line as a link.
- **320px:** nothing is cut off or scrolls sideways on any screenshot, light or dark.
- **Screen reader and keyboard,** read in the code: labels through `Field`; the form named
  "Sign in" and tied to its `role="alert"` error; the region "Sync" with a hidden
  `role="status"` that speaks only when the rule changes, without the count; `aria-expanded`
  on the line; the focus to "Cancel" when the question appears and back to "Sign out"
  after it; the focus to the new screen's heading after signing in and out, and not when a
  sign-in ends by itself.
- **`/design`** shows the `Band`, every state of the sync status, the four states of the
  sign-in form and both of sign-out.

**The developer's three deviations: accepted.** The four extra keys (`joiner` and three
headings on `/design`) are words a user reads, so they belong in `text.ts`. Escape closing
the details from the line itself is better than the design. `Band`, the heading that takes
the focus and the `Button` with a ref in the shared `ui.tsx` change nothing a user of a
project without sync sees.

**Sent back to the developer**

1. **Nothing shows that the sync line opens.** It looks exactly like the demo band, which
   does nothing, so "Last synced" and "Sync now" are found only by accident. This is a gap
   in the design, not in the build, and the design now says: at the right end of the line a
   small mark, `▾` closed and `▴` open, in the muted colour, `aria-hidden`, that never
   wraps under the words; the words stay left and wrap before the mark does. Not on the
   "Sign in again to sync" link, whose underline already says what it is. On `/design` in
   both positions.
2. **The line's focus ring is cut off.** With the keyboard on the line only the bottom edge
   of the ring shows (screenshots 07, light and dark): the rest falls outside the screen
   and under the header. Draw the ring inside the band, for the button and for the link,
   so all four sides show.
3. **`aria-controls` points at nothing while the details are closed,** because the element
   with that id is only made when they open. Keep the element in the page and hide it when
   closed.

**Seen and left as it is**

- In the field, a 60-character e-mail is cut off at the right edge, as any long value in a
  text field is; where it is read-only the whole of it is on the same screen once signed
  in.
- In dark, a disabled "Sync now" differs little from an enabled one. The look is the
  existing `Button`'s, and the line above it says why it can't be pressed.
- No screenshot shows the busy buttons, "Fetching your items…", or changes waiting while
  online; `/design` shows the busy form and the waiting line, and the rest is the tester's
  (*Done when* 8 to 11).

## Second review after building

UX designer, 2026-11-20, on commit `20cbdfe`. **Verdict: matches the design; passed on to
the tester.**

Looked at: the fourteen new screenshots of the sync line at 320px, seven in light and seven
in dark (closed, closed with the focus, open with the focus, open, open offline with two
changes, the "sign in again" link, and that link with the focus); the seven dark
screenshots the first review left out (02, 04, 05, 06, 13, 20, 21); and `SyncStatus.tsx`.

The three points of the first review:

1. **The mark: fixed.** `▾` at the right end of the closed line and `▴` when it is open,
   muted, in light and dark; the words stay left. The "sign in again" link has no mark and
   keeps its underline. In the code the mark is `aria-hidden` and can't shrink or wrap
   under the words. `/design` shows it in both positions, because its samples are the same
   component, closed and open.
2. **The focus ring: fixed.** All four sides show inside the band, on the button closed and
   open and on the link, in light and dark.
3. **`aria-controls`: fixed.** The details are always in the page and `hidden` while
   closed.

The seven dark screenshots: the sign-in screen with the empty-field sentence and the focus
on the e-mail, the empty and the filled list with "All synced", the open details, the
storage warning with its explanation, and the demo list with its band all match the design
and fit at 320px. They were taken before the fix, so their sync lines have no mark yet; the
new screenshots show it. Of `dark-20-design` only the top of the page could be read (the
band and the colours); the rest of `/design` was read in light in the first review.

Nothing is sent back. What the first review listed under *Seen and left as it is* stands.

# Test

Tester, 2026-11-20, on commit `ffeea52`, in a fresh worktree with `pnpm install
--frozen-lockfile`. No Docker on this machine: every backend was a throwaway PocketBase 0.40.6
started from the binary with the project's own `pb_migrations/` and `pb_hooks/`, on an empty
database, as the developer did.

**Verdict: sent back to the developer.** One blocking defect: the end-to-end test of `/design`'s
sync status fails at random, and with it *Done when* 3 (`node scripts/self-test.mjs --e2e`)
failed two runs of three. A second defect should be fixed in the same round: the item form
accepts a title the backend refuses for good, which stops all syncing. Everything else
passed.

## The checks, as written

- `pnpm install --frozen-lockfile`: `Done in 255ms`.
- `pnpm test`: `ℹ tests 124`, `ℹ pass 124`, `ℹ fail 0`.
- `pnpm run check`: `✓ tasks: 9 tasks, index in step`, `✓ global decisions: 25 records, index
  complete`, `✓ agents: 4 definitions`.
- `pnpm run self-test`: `✓ self-test passed: 23 steps, harness 0.5.0 in a throwaway project`.
- `BACKEND_TEST_URL=http://127.0.0.1:8190 node scripts/self-test.mjs --e2e`, three times, each
  on a fresh backend started for the origin `http://localhost:4318`:
  - run 1: **failed**, `✗ self-test failed at step 24: pnpm exec playwright test
    --reporter=list failed (1)`, with `1 failed [phone] › e2e\sync-off.spec.ts:28:1 › /design
    shows the sync status in each of its states, with the count in singular and plural`,
    `Error: expect(received).toContain(expected)`, `Expected value: "All synced"`, `Received
    array: []`; `26 passed (46.1s)`; then `1 !== 0`.
  - run 2: `✓ self-test passed: 25 steps, harness 0.5.0 in a throwaway project`.
  - run 3: **failed**, the same test with the same error; `26 passed (46.6s)`.
- In CI on the pull request, `checks / checks`, `template-e2e` and `template-backend / image`
  are green on `ffeea52` and on every earlier commit. CI's runner runs fewer tests at once,
  which makes the race below rarer, not impossible.

**The cause** (this is also the developer's unexplained `1 !== 0`): the test reads the lines
with `allTextContents()` straight after `page.goto('/design')`. That call doesn't wait, and
`/design` is a lazily loaded page, so when it hasn't rendered yet the list is empty. The page
snapshot taken after the failure shows `/design` fully rendered. Alone, with `--repeat-each=30
--workers=5`, the test failed 2 of 30 times. It ships in every project created with sync, and
in the harness's CI `retries: 1` turns one miss into `1 flaky`, which the self-test rejects.
To fix: wait for the sync region (for example `await expect(region.first()).toBeVisible()`)
before reading the lines, or assert with a retrying `expect(locator).toContainText([...])`.

## Two projects of my own

`harness create synced --sync` and `harness create local --no-sync`, both with `--no-github`,
from the packed harness, in a scratch folder:

- `synced`: `the app, from the template: 90 files, with a backend, sign-in and sync`; `pnpm
  install --frozen-lockfile`, `pnpm run typecheck`, `pnpm test` (`Test Files 10 passed | 1
  skipped (11)`, `Tests 62 passed | 5 skipped (67)`), `pnpm run build` and `harness check`
  (`✓ tasks: 2 tasks`, `✓ decisions: 10 records`, `✓ engineers: 1 listed`, `✓ generated files:
  current`) all pass.
- `local`: `50 files, without sync`; the same five pass (`Tests 29 passed (29)`, `✓ decisions: 5
  records`). It has no `backend/`, `src/auth/` or `.github/workflows/backend.yml`, and
  `pocketbase` appears 0 times in `package.json` and `pnpm-lock.yaml`.
- `synced` against a fresh backend from its own `backend/`: `bash backend/smoke-test.sh` gave
  eight `ok:` lines and `All smoke tests passed.`; `pnpm run test:backend`: `Tests 5 passed
  (5)`; its full end-to-end tests: `27 passed (46.0s)`.

## *Done when*, one by one

1. Passes: see above.
2. Passes: `template-backend / image` is green in CI; locally the smoke test and the backend
   tests pass against the binary.
3. **Fails:** two of three runs, as above. When the race doesn't hit, all 27 tests pass,
   including the 13 against the backend.
4. Passes. `CONTEXT=deploy-preview` and `CONTEXT=branch-deploy` with `BACKEND_URL` set: the
   address is in no file of `dist`, nor is the backend client (`auth-with-password`); `_headers`
   has `connect-src 'self'`. The preview does hold the words of the sign-in from `text.ts`,
   because `/design` shows the form; it has no sign-in screen. `CONTEXT=production`: the
   address is in the bundle and `_headers` has `connect-src 'self' https://<address>` and
   nothing else changed. An address with a path gives only its origin; an address that isn't
   a URL fails the production build.
5. Passes: self-test step 23, and `backend/README.md` says where the values live.
6. Passes: both reviews are in *Design*.
7. Not yet: the tag waits for this round.
8. Passes, in the end-to-end tests and in my own: a wrong password twice (`400`, "That e-mail
   and password don't match.", the password emptied and focused, the e-mail kept) and then
   the right one landed on `/items/new`, the address that was opened.
9. Passes. The tests cover both outcomes; I also held the pull to see "Signing out…" disabled.
10. Passes. My own: offline, the token's date passed, the app reopened; an item was made and
    another renamed, and the line read "2 changes not synced · Sign in again to sync" as a
    link to `/account`. Back online, signing in there sent both and the line read "All synced".
11. Passes, in the tests: each line, the details, and the storage line only on a refusal. My
    own: "1 change not synced" while online with the push held, and "Syncing…" disabled.
12. Passes (`sync-off.spec.ts`, the first test).
13. Passes (the width tests at 320px, in the project's tests).
14. Passes: every component is on `/design` in each state, and no word is hard-coded in the
    new components.

## What I tried to break

In a spec of my own in the scratch project (not committed), production build, two browser
contexts as two devices of one account, against the throwaway backend:

- **An offline edit on each device**, the later one coming online first: both devices and the
  backend end with the later edit, and the backend holds one record. Passed.
- **A delete on one and a later edit on the other**, and an edit then a later delete: the later
  change wins on both devices, the backend holds the edited one and the tombstone. Passed.
- **The server gone mid-sync** (the first item's push answered, the rest refused): "Sync failed ·
  2 changes not synced", the details say "Couldn't reach the server.", the outbox keeps 2
  rows; after "Sync now" all three are on the backend once each. Passed.
- **Busy states and "Fetching your items…"**, with requests held: "Signing in…" disabled with
  the e-mail kept; "Fetching your items…" until the first pull ends, then "Nothing here yet.";
  "1 change not synced" online; "Syncing…" disabled; "Signing out…" disabled, then the device
  is empty. Passed.
- **A sign-in that ended**, offline and online: passed (*Done when* 10).
- **Through the API, with two accounts** (A and B) and no account: B filtering on A's owner
  id gets 0, B viewing or changing A's item gets `404`, B making a record under A's id gets
  `400`, B lists only itself among users, a batch request gets `403 Batch requests are not
  allowed.`, a guest lists 0 items and 0 users, views `404`, makes nothing (`400`); a forged,
  expired token gets 0 items and its refresh `401`; A's item is unchanged; A asking for
  `_superusers` gets `403`. `funnel.json` holds only `/api/health` and the two collections.
- **The backend refusing a change** (the developer's open point): **confirmed, it blocks the
  outbox.** A 501-character title (the form has no limit; the backend allows 500) followed by
  a normal item: after waiting, the outbox still holds 2 rows, the backend has nothing, and
  the band says "Sync failed · 2 changes not synced" and "Something went wrong while syncing.",
  with no hint which item. Shortening the title released both. A note over 20,000 characters
  will do the same. Signing out then removes both changes for good.

## Judged where the task was silent

- **A sign-in lasts 30 days, renewed by every sync:** fine as the template's start; it is in
  the migration and in `auth.ts`, and an idle device simply gets "Sign in again to sync".
- **An account can't change or remove itself; nothing is removed through the API:** fine,
  and both follow D-0006 and D-0007. Removing data for good is then the Engineer's work in the
  admin screen, which suits G-0009.
- **The end-to-end tests start the throwaway backend in CI:** fine; it is what makes
  `checks / checks` prove sign-in and sync on every pull request.
- **The backend workflow also runs for `src/sync`, `src/auth` and `src/db`:** fine for pull
  requests; its push trigger and the auto-merge paths rightly list only what goes into the
  image.
- **For the architect, not blocking:** (1) the caller grants `packages: write` to the whole
  workflow, also on pull requests, where `actions/checkout` leaves the token in `.git/config`
  while the pull request's own scripts run; a separate publish job would hold that permission
  alone. (2) `Backend` is not a check auto-merge waits for (the developer's point). (3) A change
  the backend refuses for good holds up every change behind it: beyond the form's limits, the
  engine needs a decision on what to do with such a row (set it aside and say which item).

## For the developer

1. Make `e2e/sync-off.spec.ts`'s second test wait for `/design` before it reads the lines, then
   run `--repeat-each=30` on it and the e2e self-test three times in a row.
2. Give the item form the backend's limits (title 500, note 20,000), with words in `text.ts`
   that the UX designer agrees, so the app can't make a change the backend refuses.

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
- 2026-11-20 developer: built it, in the draft pull request. `create --sync | --no-sync`
  (asked in a terminal, default yes) copies `template-sync/` over `template/`: files it adds
  or replaces, and a manifest of the template's files it removes; nothing is patched. The
  overlay holds `backend/` (the image, one migration, the newest-wins and slug hooks,
  `funnel.json`, `throwaway.sh`, `smoke-test.sh`), the `backend` workflow and the auto-merge
  caller, `src/auth/`, `src/sync/`, the sync status, the sign-in and account screens, the
  decisions D-0002 and D-0005 to D-0010 and the first tasks. New in the harness: the reusable
  `backend.yml`, and a `template-backend` job in its CI that runs it on the created project
  without publishing. For both templates the security headers moved from `netlify.toml` to
  `dist/_headers`, written at build time. Recorded the designer's two points as the
  project's D-0009 and D-0010. Version to 0.5.0, the tag is the tester's.
  Checks, locally: `pnpm test`: `tests 124, pass 124, fail 0`. `pnpm run check`: `✓ tasks: 9
  tasks, index in step`, `✓ global decisions: 25 records, index complete`, `✓ agents: 4
  definitions`. `pnpm run self-test`: `✓ self-test passed: 23 steps, harness 0.5.0 in a
  throwaway project`. `node scripts/self-test.mjs --e2e`, with a throwaway PocketBase 0.40.6
  started from the binary with the template's migrations and hooks: `✓ self-test passed: 25
  steps`; in the project that syncs `27 passed` (14 on demo data, 13 against the backend).
  `bash backend/smoke-test.sh` against that backend: eight `ok:` lines and `All smoke tests
  passed.`; `pnpm run test:backend`: `Tests 5 passed (5)`. Against a backend without the two
  hooks both fail, as they should.
  In CI, on the pull request: `checks / checks`, `template-e2e` (25 steps, the backend built
  and started with Docker) and `template-backend / image` (the image built, the smoke test's
  `All smoke tests passed.`, `Tests 5 passed (5)`) are green.
- 2026-11-20 developer: where it differs from the *Design* or the *Notes*, for the designer
  and the architect. (1) `src/text.ts` has four keys the design doesn't list: `joiner`, for
  the " · " between two parts of a line, and three headings on `/design`. (2) Escape also
  closes the sync details from the line itself: offline, the details hold nothing that can
  take the focus. (3) `Band`, a heading that can take the focus and a `Button` that takes a
  ref are in the `ui.tsx` both templates share, so a project without sync shows the `Band`
  on `/design` too; its screens look as they did. (4) What sync remembers on a device (the
  account, the token, how far the last pull got) is in localStorage, not in a Dexie table,
  so `src/db/` is the same in both templates. (5) The template's records don't cite G-0026:
  it is not in the registry on `main` yet, and a project would name a decision it can't
  read; `backend/README.md` says in words where addresses and keys live. (6) Without sync
  the template's task to add a backend is gone and the translate task is T-0002.
  Chosen by the developer where the task was silent, to confirm or change: a sign-in lasts
  30 days and syncing renews it; an account can't change or remove itself; nothing is
  removed through the backend's API; the smoke test takes its superuser from
  `throwaway.sh`, so it needs no Docker of its own; a project's end-to-end tests start the
  throwaway backend themselves (always in CI, left out on a machine without Docker), so its
  `checks / checks` proves the sign-in and sync on every pull request; its `backend`
  workflow also runs for pull requests that touch `src/sync/`, `src/auth/` or `src/db/`.
- 2026-11-20 developer: found on the way, not fixed here, for the architect. A project's
  auto-merge acts on `CI` only: a pull request whose `Backend` run failed can still merge,
  though CI's end-to-end tests do build and use the image. A change the backend refuses for
  good stays at the head of the outbox and holds up the ones behind it. Behind the Funnel
  every device may reach the backend from one address, so PocketBase's sign-in limit (two
  per three seconds) would be shared by all of them; whether to trust the proxy's header is
  a question for slice 3. 0.5.0 skips 0.4.0, which T-0007 carries: whichever merges second
  settles `package.json` and the README.
- 2026-11-20 developer: Remaining: what could not be proven here. No machine here has
  Docker: `throwaway.sh`, the image build and the reusable `backend.yml` ran in CI only.
  The `Publish` step never ran (it runs on a project's default branch only), and neither did
  the auto-merge caller starting `backend.yml` after a merge, nor a created project's own
  first CI run on GitHub. That the host sends `dist/_headers` as written, now that the
  policy is no longer in `netlify.toml`, needs a real site. All of these come with the live
  proof of T-0004. Light and dark at 320px, and the words, are the designer's to judge
  (*Done when* 6). Handed to the UX designer for the review, then the tester.
- 2026-11-20 ux-designer: reviewed: sent back to the developer. The screens match the design
  at 320px in light and dark, and the three deviations are accepted; three small changes to
  the sync line are listed under *Review after building*: a mark that shows it opens (a gap
  in the design, now added to it), a focus ring that is cut off, and `aria-controls`
  pointing at nothing while closed. The pull request stays a draft.
- 2026-11-20 developer: fixed what the UX designer sent back, all in the sync line
  (`SyncStatus.tsx`). (1) A mark at the right end says that it opens: `▾` closed, `▴` open,
  muted and `aria-hidden`; the words wrap first and the mark never wraps under them; the
  "Sign in again to sync" link has none. Both positions are on `/design`. (2) The focus
  ring is drawn inside the band, so all four sides show, for the button and the link.
  (3) The details stay in the page and are hidden while closed, so `aria-controls` always
  points at them. The end-to-end tests now compare the line's words without the mark, and
  check the mark, the hidden details and that the link has no mark. Checks: `pnpm test`:
  `tests 124, pass 124, fail 0`; `pnpm run check` passes; `node scripts/self-test.mjs --e2e`
  against a throwaway PocketBase from the binary: `✓ self-test passed: 25 steps, harness
  0.5.0 in a throwaway project`, three runs in a row. One run before those ended with
  `1 !== 0` from a step whose output was not kept; it did not come back, and is unexplained.
  Handed back to the UX designer for the second review.
- 2026-11-20 ux-designer: reviewed: matches the design, on commit `20cbdfe`. The three points
  of the first review are fixed (the mark on the sync line, its focus ring, the details
  always in the page), and the seven dark screenshots left out the first time match too
  (*Second review after building*; *Done when* 6). Handed to the tester; the pull request
  stays a draft until the tester has passed it.
- 2026-11-20 tester: sent back: `node scripts/self-test.mjs --e2e` failed 2 of 3 runs, always
  on `/design shows the sync status in each of its states`, which reads the lines before the
  lazy page has rendered (2 of 30 alone); and the item form takes a title the backend refuses
  for good, which stops every change behind it. Everything else passed (*Test*). The pull
  request stays a draft; back to the developer.
