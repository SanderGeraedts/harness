---
id: T-0003
title: "Spin up a repository and app from one prompt"
description: "A command the Engineer runs that creates a new repository with the app from the default stack, the harness installed and initialised, CI and auto-merge wired, and the default branch protected."
status: Doing               # Open | Doing | Done | Dropped
depends_on: [T-0002]        # tasks that must be Done first
decisions: [G-0004, G-0007, G-0016, G-0017, G-0019, G-0020, G-0021, G-0024, G-0025]
raised_on: 2026-11-20
done_on: ""
result: []                  # PR URLs
---

# Goal

Phase 3, the first half of spin-up (G-0024): the project template. From one prompt, in a
session with the Engineer, the harness creates a new project that can be worked on by the
team straight away:

- a GitHub repository;
- the app from the default stack (G-0017): React, TypeScript and Vite, TanStack Router,
  Tailwind, Vitest, Playwright, vite-plugin-pwa and Dexie, with pnpm pinned (G-0016), seeded
  demo data (G-0019) and slug addresses (G-0021);
- the harness installed at the current tag and initialised, with the Engineers listed;
- the CI and auto-merge caller workflows, pinned to the same tag;
- the default branch protected with `harness protect` once CI has run (G-0025).

Hosting and the backend are T-0004.

# Done when

- A new `harness` subcommand (or a documented prompt that drives one) creates such a project
  in a throwaway repository, and in it: `pnpm install`, the type-check, the unit tests, the
  build and `pnpm exec harness check` pass, locally and in its CI.
- A draft pull request in the new repository, marked ready, merges itself under the ruleset.
- The command refuses to run when `harness role` is not `engineer`.
- The self-test covers what can be covered without creating a real repository.

# Notes

- Decide first, as an open question for the Engineer if needed: whether the template lives
  in this repository or in a template repository of its own.
- Ask what the project is for, its look and its language (G-0020); record the answers as the
  new project's first decisions.

# Design

The template's first screens, a neutral example every project replaces: a list of items
with a title, a note and a status. Phone first, one column, at most 42rem wide.

- **Every screen:** the project's title top left with the accent bar under it, linking
  home. Under it, outside production, a quiet band: "Demo data · sync is off".
- **List (`/`):** the heading "Items" and the main button "New item". One card per item,
  newest change first: the title, a status badge (open, doing, done) and the first line of
  the note. The whole card is the link. Empty: "Nothing here yet. Add the first item."
- **Item (`/items/<slug>`):** a back link, the title as the heading with its badge, the
  note with its line breaks, then "Edit" (main button) and "Delete". Delete asks in place,
  "Delete this item?" with "Yes, delete" and "Cancel"; no pop-up. An address that leads
  nowhere shows "Not found" with a link home; an address from before a rename moves to the
  new one.
- **Form (`/items/new`, `/items/<slug>/edit`):** Title, Note (optional, four lines) and
  Status, with "Save" and "Cancel". Saving without a title says "Give the item a title."
  and stays. After saving, the item's page.
- **Look:** one accent colour, used for the heading bars, the main button, link underlines
  and the focus ring; the text on it is black or white, whichever contrasts more. Neutral
  greys for the rest, status badges in blue, amber and green. Light or dark follows the
  device; there is no switch. One font stack with no font files.
- **`/design`:** every colour token, the type sizes and each component (buttons, badges,
  card, field), in the device's colour scheme. Not in production builds.
- **Words:** all in one file, in English; another language is the new project's own task.

Review after building: checked on a phone-sized screen in light and dark. The four screens
match the above; contrast of the default accent with its text is 4.6:1.

# Test

Tester, 2026-11-20, on commit `a81a3ae` of the pull request's branch (Node 24.22.1, pnpm
12.18.0, Windows). **Verdict: sent back.** `harness create` and every check pass, but the
template's list screen is wider than a phone's screen (1 below), and the template is what
every new project starts from. Six smaller findings follow; they don't block on their own.

## The checks, as run

`pnpm install --frozen-lockfile`:

```
Lockfile is up to date, resolution step is skipped
Done in 88ms using pnpm v12.18.0
```

`pnpm test`:

```
ℹ tests 104
ℹ suites 25
ℹ pass 104
ℹ fail 0
```

`pnpm run check`:

```
✓ tasks: 5 tasks, index in step
✓ global decisions: 25 records, index complete
✓ agents: 4 definitions
```

`pnpm run self-test`:

```
17. harness create refuses anyone who is not the Engineer
18. harness create --no-github makes a project from the template
19. the created project installs, type-checks, passes its tests, builds and passes harness check

✓ self-test passed: 19 steps, harness 0.3.0 in a throwaway project
```

`node scripts/self-test.mjs --e2e`:

```
20. the created project passes its end-to-end tests

✓ self-test passed: 20 steps, harness 0.3.0 in a throwaway project
```

CI on the pull request at `a81a3ae`: `checks / checks` and `template-e2e` both green.

## A project of my own

`node bin/harness.mjs create trial-one --no-github --dir <temp>/trial-one --purpose "Keep a
list of things to try." --accent "#AA3366" --font serif --engineer <my login> --harness-ref
<the branch's commit>`, in a temporary folder outside any repository:

```
✓ the app, from the template: 47 files
✓ installed the dependencies, and the harness from github:SanderGeraedts/harness#a81a3ae1594929db9e723e1785cf309290eae5ab
✓ harness initialised: Engineers <my login>; 5 decisions and the first tasks recorded
✓ tasks: 2 tasks, index in step
✓ decisions: 5 records, index complete, 0 overrules valid
✓ engineers: 1 listed
✓ generated files: current
✓ first commit on main
Stopped before GitHub (--no-github). The project is in <temp>/trial-one
```

In it:

- `pnpm install --frozen-lockfile`: `Lockfile is up to date`, exit 0.
- `pnpm run typecheck`: exit 0.
- `pnpm test`: `Test Files 4 passed (4)`, `Tests 24 passed (24)`.
- `pnpm run build`: `✓ built`, `precache 15 entries`, `dist/sw.js`.
- `pnpm exec harness check`: the four ✓ lines above, exit 0.
- `pnpm run test:e2e` (the preview server on the build, a Pixel 7): `8 passed (8.2s)`.
- One commit on `main`, a clean work tree, `core.hooksPath` is `.githooks`.
- No placeholder left: a search for `__PROJECT_`, `__ACCENT__`, `__ON_ACCENT__`, `__FONT`,
  `__LANGUAGE__`, `__HARNESS_REF__` and `__DATE__` outside `node_modules` finds nothing.
  The only `__NAME__` left are the two build-time constants.
- No UUID in an address, a link or anywhere in the page: checked on every screen, after
  creating, renaming and deleting, in the address bar and in the whole page source. The
  demo ids (`demo-1`) don't appear either.
- The five decisions and the tasks read as a sensible start: the purpose, the accent
  (lower-cased) and the font are filled in, and each record names the decisions it follows.
- A production build (`CONTEXT=production`): no demo items in the bundle, an empty list,
  the band "Only on this device · sync is not set up", `/design` is "Not found" and its
  chunk is gone. A preview build given a backend address doesn't contain it; a production
  build does.

## What I tried in the app

My own Playwright tests against the preview, at 320 by 480 unless said:

- Passed: a 600-character title (the slug is 60 characters, cut at a hyphen); the same
  title twice (`tea`, `tea-2`); the title "New" and titles of only emoji or only
  non-Latin letters (`item`, `item-2`, `item-3`); a title of HTML, shown as text; a title
  of spaces, refused with "Give the item a title."; a double click on Save, one item; a
  rename, after which the old address and the old edit address move to the new one and a
  new item with the old title gets `-2`; a rename back, which takes the old slug again;
  delete, which asks in place with no pop-up, Cancel keeps the item, and the deleted slug
  stays taken; `/nonsense`, `/items/new/edit`, `/items/`, `/items/a/b/c` and encoded
  addresses, all "Not found"; the newest change first in the list; offline create, edit and
  delete (the project's own test); light and dark.
- **Failed:** the list screen, see 1.

## What I tried on `create`

Each of these was refused with exit 1 and wrote nothing:

| Tried | Answer |
| --- | --- |
| names `My App`, `MyApp`, `-lead`, 64 characters, `café`, `a/b`, `..`, `trail-` | `"…" isn't a project name: lower-case letters, digits and hyphens, e.g. my-project` |
| no name, an empty name | `name the project: harness create <name>` |
| two names; a stray `-x` | `one name, not 2: …` |
| `--accent red`, `#fff`, `#gggggg`, empty | `"…" isn't a colour like #2f6fed` |
| no `--purpose`, not in a terminal; a purpose of spaces | `say what the project is for: --purpose "..."` |
| a purpose of 301 characters | `keep the purpose to one sentence (300 characters at most)` |
| `--font comic`; `--language Dutch`, `NL`, `nl; rm -rf` | `isn't a font: …`; `isn't a language code like en, nl or pt-BR` |
| a title of 61 characters; `--bogus` | `keep the title to 60 characters at most`; `unknown option --bogus` |
| `--harness-ref "a b"`, `v1;echo` | `"…" isn't a tag, branch or commit` |
| the target is a folder with a project in it, a folder with one hidden file, a file; the same command twice | `<path> already exists and isn't empty`; nothing in it was touched |
| `--engineer someone-else` (the signed-in login not among them) | `only the Engineer creates a project (G-0024): <login> is not among --engineer someone-else` |
| no `--engineer`, outside a project | `only the Engineer creates a project (G-0024): run this inside a project where you are an Engineer, or name the new project's Engineers with --engineer <login>` |
| the machine's other signed-in account, with `--engineer <my login>` | refused the same way: a real run as someone who is not the Engineer |
| a `gh` token that isn't valid | `only the Engineer creates a project (G-0024), and gh is not signed in: run gh auth login` |
| inside a project whose `.harness/engineers` lacks the login, even with `--engineer <my login>` | `… is not in this project's .harness/engineers` |

And these ran:

- `--harness-ref no-such-ref-zzz`: fails at the install with pnpm's
  `Could not resolve no-such-ref-zzz to a commit`, exit 1. See 3.
- `--language nl --accent "#FFEE00" --font mono`, a title and purpose full of quotes,
  tags, ampersands, backslashes and backticks: created; the page and manifest say `nl`,
  T-0003 "Translate the interface" is there (3 tasks), the text on the yellow accent is
  `#111111`, the title is escaped in the page and quoted in the code; type-check, 24 unit
  tests, build, `harness check` and the 8 end-to-end tests pass. See 2 and 4.

## `lib/create.mjs`, read

- **Outside the target folder:** nothing. The name can't hold a slash or dots; every write
  goes under `--dir`, which must be absent or empty; git, pnpm and the harness run with it
  as their working folder.
- **The token:** never read, printed or written by `create`. `gh` keeps it; the push gets
  it through `gh auth git-credential`; `gh api -i user` is read only for the scopes header
  and its output is not logged.
- **The first push without the pre-push hook:** one git command with
  `-c core.hooksPath=.git/hooks`, so the setting lasts for that command only and the
  project's `.githooks` stays in force afterwards. It is reached only after `create` found
  no repository of that name, or an empty one, and made the first commit itself. I find it
  limited to the first push of a new repository, as G-0025 allows.
- **A step that fails halfway** leaves what was done: see 3. After the repository exists,
  the messages do say what to do next.

## The diff, searched

Every added line of the branch, the lockfile apart, for another project's name, a person's
name, an e-mail address, a domain, an IP address, a tailnet or pool name: nothing. The only
addresses are `backend.example`, `localhost`, `example.invalid` and
`github.com/engineer-one/my-project` in tests. The lockfile holds registry packages only.
The throwaway repository of the live run is not named.

## Findings

1. **Blocking: the list screen is wider than the phone.** The list is a grid whose one
   column grows to the longest note, because the note is cut off with an ellipsis on one
   line and nothing limits the column. With the demo data and the serif font the page is
   392px wide on any narrower screen: at 320, 344, 360, 375 and 390 it scrolls sideways
   and the status badges are off the screen. At 412 (the test device) one note of 110
   characters makes the page 811px wide, with every badge at 744 to 794px. The item, form
   and `/design` screens fit at every width. To see it: `pnpm run build`,
   `pnpm run preview`, a 375px wide window, `/`; or add an item with a two-sentence note at
   any phone width. The design says phone first, one column, and a card with the title,
   the badge and the first line of the note. The end-to-end tests don't catch it: they run
   at 412px with short notes and never compare the page's width with the screen's. A test
   that does belongs with the fix.
2. `create` garbles `AGENTS.md` when the title or purpose holds `$&`, `` $` `` or `$'`:
   `describeInAgents` passes them to `String.replace` as a replacement string. With `$'`
   the purpose is cut short and half the file is repeated; `harness check` still passes.
3. A run that fails after the copy (a ref that doesn't exist, no network, no git identity)
   leaves the half-made folder, and the next run answers `already exists and isn't empty`.
   Nothing says to remove the folder first; only the failed push says so.
4. `--engineer a,b --engineer b` writes `b` twice to `.harness/engineers` ("3 listed").
5. The band reads "Demo data · sync is off (local)"; the design has no "(local)".
6. The card shows the whole note on one line with the line breaks as spaces ("Check the
   train times. Book a table for Sa…"), where the design says the first line of the note.
7. An unbroken word of 400 characters as a title makes the item page 15766px wide. Far
   from ordinary use; the same fix as 1 may cover it.

Also for the record, none a defect in the code:

- The Log has no line of the UX designer's review after building; the review itself is
  under *Design*. Its "checked on a phone-sized screen" did not see 1.
- The first commit is made with whatever git identity the machine has. Where the
  machine's default is not the account the repository belongs to, that address goes to
  GitHub with the first push. A note in the README would do.
- The README's example runs `create` inside a project, where the default `--dir` puts the
  new project's folder inside that project's repository.
- `template-e2e` is not a required check; whether the ruleset should require it is for the
  Engineer.

Not done, because the task did not pass: marking the pull request ready, and the tag
`v0.3.0`.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.

- 2026-11-20 engineer: decided that the template lives in this repository, under
  `template/`, so it is versioned and tested with the harness.
- 2026-11-20 engineer: decided the command is `harness create <name>`. It asks, or takes as
  flags, what the project is for, its look (accent colour and font) and its language,
  records the answers as the project's first decisions and writes a first task list.
- 2026-11-20 engineer: decided that sync and the backend come in T-0004. This task's app is
  local-first and ready to sync (Dexie with `updatedAt`, tombstones and an outbox, one write
  API, slug addresses, seeded demo data, no backend), with a seam for T-0004: `src/sync/`
  and a config module that reads the backend address only in production builds.
- 2026-11-20 ux-designer: wrote the design of the template's first screens (above).
- 2026-11-20 developer: built `template/` and `harness create` (`lib/create.mjs`), with unit
  tests (`test/create.test.mjs`) and self-test steps: a refused create, `create --no-github`
  from the installed package, then install, type-check, unit tests, build and
  `harness check` in the created project. The template's end-to-end tests run in the
  harness's CI in their own job (`node scripts/self-test.mjs --e2e`) and in every created
  project's CI.
- 2026-11-20 developer: the rule for who may create: inside a project, the signed-in account
  must be in its `.harness/engineers`; elsewhere `--engineer` is required and must include
  the signed-in account. Outside a project this is a statement, not a lock: what really
  limits it is the account's rights on GitHub.
- 2026-11-20 developer: `create` makes the first push to the new repository's `main` without
  the project's pre-push hook: the first commit of an empty repository, before a ruleset can
  exist (G-0025). Said plainly in the pull request for the tester and the Engineer to weigh.
- 2026-11-20 developer: `--harness-ref` sets what is installed and what the workflows are
  pinned to; it defaults to the tag of the running harness. Until this is released, a
  project is created with the branch's commit as the ref.
- 2026-11-20 developer: the live run found two things, both now handled in `create`. The
  push carries workflow files, which a `gh` token without the `workflow` scope may not push:
  `create` checks this before it writes anything, and uses an empty repository of the same
  name instead of refusing it, so a stopped run can be repeated. And GitHub refuses rulesets
  on a private repository on a free plan: `create` then finishes with a `Remaining:` line
  instead of failing.
- 2026-11-20 developer: merged `main` with T-0005 (0.2.0) into the branch and set the
  version to 0.3.0, the version that will carry `create`; the tag is the tester's.
- 2026-11-20 developer: live run of `harness create` into a private throwaway repository,
  with the branch's commit as `--harness-ref`: created, pushed, first CI run green
  (`checks / checks`, with the end-to-end tests). A draft pull request with a trivial
  change stayed open while it was a draft and, marked ready, was merged by the auto-merge
  workflow after its CI run. The ruleset could not be made: GitHub refused it for a private
  repository on the account's plan (HTTP 403).
- 2026-11-20 developer: Remaining: the tester's run and the tag `v0.3.0`. For the Engineer:
  whether new repositories stay private by default now that a private one can't get a
  ruleset on a free plan; and deleting the throwaway repository, which only the Engineer
  does.
- 2026-11-20 tester: sent back: the template's list screen is wider than a phone's screen
  as soon as a note is longer than the screen (finding 1 under *Test*). Everything else
  passed; six smaller findings are listed there. Back to the developer; the pull request
  stays a draft and there is no tag yet. Still for the Engineer: the two points in the line
  above.
