# The global decision registry

The decisions that hold in every project that installs the harness, one file each. Agents
read [index.md](index.md) first, then the project's own index, then only the records their
work touches.

## Two registries

| Registry | Where | Records | Holds |
| --- | --- | --- | --- |
| Global | this folder, read by projects from `node_modules/@sandergeraedts/harness/decisions/` | `G-NNNN-<slug>.md` | what is the same in every project: the way of working, the default stack, the infrastructure |
| Project | the project's `docs/decisions/` | `D-NNNN-<slug>.md` decisions, `Q-NNN-<slug>.md` open questions | what is specific to that project |

A project's registry is explained by the README that `harness sync` writes into it
(`templates/decisions-README.md` here).

## Overruling a global decision

A project may set a global decision aside with a project decision that names it:

```yaml
overrules: [G-0017]
```

and says in its Context why the global decision doesn't fit. That project decision wins in
that project for as long as it is Accepted. `harness overrules` lists every overrule in a
project, and `harness check` fails when one names a decision that doesn't exist (G-0002).
The harness never records which projects overrule what.

## Replace, never edit

A decision is never edited once Accepted. The one exception is redacting personal details
without changing what was decided (G-0003). To change a global decision:

1. Write a new record that stands alone, with the next free id, `since` set to the version
   that will carry it, and the old id in `replaces`.
2. Set the old record to `status: Replaced`, with `replaced_by` and `changed` set to that
   same version.
3. Move the old record's index line to *Replaced* and add the new one.

Ids are never reused.

A project decision that a global one covers is replaced by it: its `replaced_by` may name a
global id (`replaced_by: [G-0016]`), and `harness check` fails when that id isn't in the
installed harness.

## Front matter

| Field | Meaning |
| --- | --- |
| `id`, `title`, `description` | the id matches the file name; the description is the index sentence |
| `status` | `Accepted` or `Replaced` |
| `date`, `decided_by` | when, and which role decided: always `engineer` here |
| `since` | the harness version that added the record |
| `changed` | the harness version in which it was replaced or redacted; empty until then |
| `replaces`, `replaced_by` | the records this one replaces, or that replaced it |

`since` and `changed` are what `harness changes <from> <to>` reads to tell a project which
global decisions an update brings (G-0005).

## Adding or changing a global decision

- Propose it by pull request. A pull request that touches this folder waits for the
  Engineer; it never merges itself (G-0006).
- Write it generally: no project, no person, only the roles Engineer and Requester.
- Every record has Context, Decision, Rationale, Consequences and *Guidance for agents*.
- Update [index.md](index.md) in the same commit: `- [G-NNNN Title](file.md): one sentence`.
  `harness check` fails when the index and the files differ.
- Bump the version in `package.json` to the one named in `since` or `changed`.
