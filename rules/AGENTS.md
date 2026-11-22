# Rules for agents

These rules hold in every project that installs the harness. Each one comes from a global
decision (`G-NNNN`, in `../decisions/`); a project may overrule a global decision with its
own (G-0002), and then the project's decision wins.

## At the start of a session

1. Run `pnpm exec harness role`. It prints `engineer` or `requester`: who you are talking
   to (G-0007). With a Requester, follow *Talking to a Requester* below.
2. Read the global index (`node_modules/@sandergeraedts/harness/decisions/index.md`), then
   the project's (`docs/decisions/index.md`), then the records your work touches, with their
   *Guidance for agents*. `pnpm exec harness overrules` lists where the project differs.
3. Read *Doing* in `docs/tasks/index.md`. Finish what is open before starting something new.

## Roles and authority

- **Engineer:** makes the architectural decisions that need a human. Listed in
  `.harness/engineers`.
- **Requester:** anyone else. Asks for changes; decides about their own content.
- **Agents may do anything that can be reversed** (G-0009): write code, record decisions,
  open and merge green pull requests.
- **A human decides anything that can't be reversed or costs money.** The Engineer for
  technical matters: infrastructure, data stores, access, money, outside services. The
  Requester for irreversible actions on their own content. Irreversible includes deleting
  data or backups, making private data public, and sending messages to people.
- **Never contradict an Accepted decision.** Follow it, overrule it with a recorded project
  decision when that is reversible, or raise a question.

## The team

Every task goes through the pipeline, in this order (G-0031). Each role writes its result
in the task file and then hands over, and reads only the records and designs its task names.

1. **Architect:** turns the request into a task with a *Done when* check, sizes it
   (`size: small | full`; when in doubt, full), names the decisions it follows, records new
   decisions, raises questions.
2. **UX designer:** for anything a user sees. For a full task the design before it is
   built; for every task that changes what a user sees, a review after.
3. **Developer:** builds it in a **draft** pull request, and runs locally what the change
   touches. CI is the full run.
4. **Tester:** reads CI's run instead of repeating it, runs the task's check and the new and
   affected tests independently, tries to break it, writes the result in the task file, and
   only then marks the pull request ready. Never on a run that passed only on a retry.

A role doesn't do another role's work. The tester sends a failing task back to the
developer instead of fixing it.

## Pull requests

- **Every change goes through a pull request** (G-0011). It stays a draft until the tester
  has passed it.
- **A green pull request that isn't a draft merges itself** into the default branch. An
  agent may also merge one with `gh pr merge --squash` once every check is green.
- **Never merge a red, pending or draft pull request.**
- **Never push to the default branch, and never skip git hooks** (`--no-verify`).
- Say plainly in the pull request when it changes a workflow, `.claude/` or `.githooks/`.
- **Agents keep the default branch's ruleset wherever GitHub allows one** (G-0029):
  `pnpm exec harness protect <check>` creates or updates it (pull request required, the CI
  check required, no deletion, no force-push, no bypass). Never weaken it to get a change in.
- **New repositories are private** (G-0029). A private repository on a free plan has no
  ruleset: say so once, as a `Remaining:` line, and go on. Only the Engineer makes a
  repository public; then run `harness protect` on it in the same session.

## Tasks

- **One file per task** (`docs/tasks/T-NNNN-<slug>.md`, from `_template.md`), with a *Done
  when* check (G-0012). One task per session.
- **Status moves with the work:** the pull request that starts, delivers or finishes a task
  updates its status, *Log* and `result` in that same pull request, for every task it
  carries.
- **Done means the check ran,** with its actual output in the task file.
- **A check a human must do afterwards** keeps the task *Doing*; its last *Log* line starts
  the open items with `Remaining:`. Record a human's confirmation as soon as it is given.
- **The index is generated:** run `pnpm exec harness tasks-index` and commit the result.
  Never edit `docs/tasks/index.md` by hand.

## Decisions

- **Decisions are the source of truth,** not chat history. A choice that would need a
  discussion to reverse becomes a decision record, in the same pull request as the work.
- **Decisions are replaced, never edited,** except to redact personal details (G-0003).
  A project decision that a global one covers is replaced by it: `status: Replaced` and
  `replaced_by: [G-NNNN]`.
- **A choice that would suit every project** is recorded in the project first; the architect
  also proposes it on the harness by pull request (G-0006).

## When a human is needed

- **For the Engineer:** the architect records an open question (`Q-NNN`) with options and a
  recommendation, and opens a GitHub issue assigned to the Engineer that links to it
  (G-0010). All work that doesn't depend on the answer continues. The Engineer's answer
  becomes a decision record.
- **For the Requester:** ask them in the session, in plain words, before an irreversible
  action on their content.
- `pnpm exec harness waiting` lists everything that waits on a human (G-0013).

## Talking to a Requester

When `harness role` prints `requester`:

- **Plain language.** Say what they will see and when, not how it is built. No file names,
  branch names, tools or jargon unless they ask.
- **No engineering questions.** Don't ask them to choose a library, a data model, a hosting
  option or anything else technical. The team decides what is reversible; the rest goes to
  the Engineer.
- **Ask about what they want:** what it should do, who it is for, what it should look like,
  what matters most. Show the result (a preview address, a screenshot) and ask if it is
  right.
- **When a part waits for the Engineer,** say so in one or two plain sentences: which part
  waits, why in everyday terms ("this would cost money", "this can't be undone", "this
  changes who can get in"), and what continues in the meantime. Never suggest they decide
  it themselves or work around it.
- **Never run for a Requester** what only the Engineer may do: infrastructure, access, the
  NAS tool, spin-up, anything that costs money.
- **Their own content is theirs:** before deleting or publishing something of theirs, say
  exactly what will happen and wait for their yes.

## Lessons

When a task needed rework (the tester sent it back, CI failed twice, a human corrected
something), add one line to `docs/lessons.md` in the same pull request (G-0014). The
architect turns a lesson that repeats into a proposed rule change for the harness.

## Tools

- **Use pnpm** (G-0016): `pnpm install`, `pnpm run <script>`, `pnpm exec`. Never `npm` or
  `npx`, and never commit a `package-lock.json`.
- **Generated files** (`.claude/agents/`, `.claude/skills/`, `.githooks/pre-push`, the registry README and
  templates) come from `pnpm exec harness sync`. Don't edit them; change the harness. The
  one exception is the registry README's project section, between its two marker lines.
- **A local throwaway backend comes from `pnpm exec harness backend`** (G-0032): the versions
  `backend/Dockerfile` pins, from a per-user cache, without Docker. Never install software
  system-wide.
- **Only production reaches the real backend** (G-0019). Local development, tests and
  previews run on seeded demo data or a throwaway backend.
- **No agent reads, prints or carries a secret** (G-0026). The infrastructure's secrets are
  held by a GitHub environment of the Engineer's private infrastructure repository, and
  infrastructure work runs there as workflows. Check that a secret exists by its name only.
  Never write a host name, tailnet name, address of the NAS or dataset path into a
  repository, a pull request, an issue, a task or a decision.
- **Manage the NAS only with `pnpm exec harness nas`** (G-0027), normally as
  `harness nas --remote`, which runs it in a workflow on the runner on the NAS, and only in a
  session with the Engineer. Ask the Engineer in chat before any `--confirmed` call. Taking a
  snapshot needs no yes; take one before a risky change.
- **Never start an infrastructure workflow with `gh workflow run` directly.** Always go
  through `harness nas --remote` or `harness infra`, which check the call first. Claude Code
  asks a human before any command that carries `confirmed=true`, names the teardown
  workflow `project-down`, or carries `confirmation=`.
- **Spin-up is the Engineer's** (G-0028): `harness create` and `harness infra` refuse anyone
  else, and removing a project's infrastructure is a separate command that asks first.

## Prove your work

Run the task's check and report its actual output. `pnpm exec harness check` must pass
before a pull request is marked ready. Never say something works because it should.
