# CLAUDE.md

@AGENTS.md
@node_modules/@sandergeraedts/harness/rules/AGENTS.md

## Claude Code specifics

- The team is in `.claude/agents/`: architect, ux-designer, developer, tester. Hand each
  task through them in that order.
- The team's skills are in `.claude/skills/`. Run `grill` before a new project or a large
  feature: it interviews the human until the brief is agreed.
- Keep project knowledge in `docs/decisions/` and `docs/tasks/`, not in auto-memory.
- Start larger pieces of work in a fresh session; anything the next session needs goes in
  the repository.
