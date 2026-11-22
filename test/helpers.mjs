import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const made = [];
export function tempDir(prefix = 'harness-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}
export function cleanUp() {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export function write(dir, rel, content) {
  const path = join(dir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

// An empty Node project, as `harness init` expects to find one.
export function tempProject() {
  const dir = tempDir();
  write(dir, 'package.json', `${JSON.stringify({ name: 'throwaway', private: true, version: '0.0.0' }, null, 2)}\n`);
  return dir;
}

export const task = ({ id = 'T-0001', title = 'Do the thing', status = 'Open', size, doneOn = '', log = '' } = {}) => `---
id: ${id}
title: "${title}"
description: "One sentence about ${title.toLowerCase()}."
status: ${status}            # Open | Doing | Done | Dropped
${size === undefined ? '' : `size: ${size}            # small | full
`}depends_on: []
decisions: []
raised_on: 2026-01-02
done_on: "${doneOn}"
result: []
---

# Goal

Something.

# Done when

A check passes.

# Log

One line each, newest last.
${log}`;

export const decision = ({ id = 'D-0001', title = 'A choice', status = 'Accepted', overrules = [], replacedBy = [], extra = '' } = {}) => `---
id: ${id}
title: "${title}"
description: "One sentence about ${title.toLowerCase()}."
status: ${status}            # Accepted | Replaced
date: 2026-01-02
decided_by: engineer
overrules: [${overrules.join(', ')}]
replaces: []
replaced_by: [${replacedBy.join(', ')}]
resolves: []
tags: []
${extra}---

# Context
`;

export const question = ({ id = 'Q-001', title = 'Which one?', status = 'Open', resolvedBy = [] } = {}) => `---
id: ${id}
title: "${title}"
description: "One sentence about it."
status: ${status}
raised_on: 2026-01-02
raised_by: architect
resolved_by: [${resolvedBy.join(', ')}]
---

# Question
`;

export const globalDecision = ({ id, title = 'A global choice', status = 'Accepted', since = '0.1.0', changed = '', replacedBy = [] }) => `---
id: ${id}
title: "${title}"
description: "One sentence about ${title.toLowerCase()}."
status: ${status}
date: 2026-01-02
decided_by: engineer
since: ${since}
changed: "${changed}"
replaces: []
replaced_by: [${replacedBy.join(', ')}]
---

# Context
`;

export const indexOf = (files) => `# Decisions\n\n${files.map((f) => `- [${f}](${f}): a record`).join('\n')}\n`;
