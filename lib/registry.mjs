// Reads and checks a decision registry: the global one in the harness (G-NNNN) or a
// project's (D-NNNN decisions, Q-NNN questions). See decisions/README.md.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isVersion, list, parse, read } from './frontmatter.mjs';

export const DEFAULT_DECISIONS_DIR = 'docs/decisions';
const KINDS = {
  global: [{ prefix: 'G', re: /^G-\d{4}-.*\.md$/, type: 'decision' }],
  project: [
    { prefix: 'D', re: /^D-\d{4}-.*\.md$/, type: 'decision' },
    { prefix: 'Q', re: /^Q-\d{3}-.*\.md$/, type: 'question' },
  ],
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readRecords(dir, kind) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((file) => {
      const k = KINDS[kind].find((x) => x.re.test(file));
      if (!k) return [];
      const { hasFrontMatter, fields } = parse(read(join(dir, file)));
      return [
        {
          file,
          type: k.type,
          hasFrontMatter,
          fields,
          id: fields.id,
          title: fields.title,
          description: fields.description,
          status: fields.status,
          overrules: list(fields.overrules),
          replaces: list(fields.replaces),
          replacedBy: list(fields.replaced_by),
          resolvedBy: list(fields.resolved_by),
          since: fields.since,
          changed: fields.changed || undefined,
        },
      ];
    });
}

// Front matter problems of one registry. `globalIds` (project registries only) is the set
// of ids in the global registry, for `overrules`.
export function checkRecords(records, kind, { label, globalIds } = {}) {
  const problems = [];
  const ids = new Set(records.map((r) => r.id));
  const seen = new Set();
  for (const r of records) {
    const at = `${label}/${r.file}`;
    if (!r.hasFrontMatter) {
      problems.push(`${at}: no front matter`);
      continue;
    }
    if (!r.id || !r.file.startsWith(`${r.id}-`)) problems.push(`${at}: id ${r.id} doesn't match the file name`);
    if (seen.has(r.id)) problems.push(`${at}: id ${r.id} is used twice`);
    seen.add(r.id);
    if (!r.title) problems.push(`${at}: no title`);
    if (!r.description) problems.push(`${at}: no description`);
    if (r.type === 'question') {
      if (!['Open', 'Resolved'].includes(r.status)) problems.push(`${at}: status "${r.status}" isn't Open/Resolved`);
      if (!DATE.test(r.fields.raised_on ?? '')) problems.push(`${at}: raised_on isn't a date`);
      if (r.status === 'Resolved' && r.resolvedBy.length === 0) problems.push(`${at}: Resolved but resolved_by is empty`);
      for (const id of r.resolvedBy) if (!ids.has(id)) problems.push(`${at}: resolved_by names ${id}, which doesn't exist`);
      continue;
    }
    if (!['Accepted', 'Replaced'].includes(r.status)) problems.push(`${at}: status "${r.status}" isn't Accepted/Replaced`);
    if (!DATE.test(r.fields.date ?? '')) problems.push(`${at}: date isn't a date`);
    if (!r.fields.decided_by) problems.push(`${at}: no decided_by`);
    if (r.status === 'Replaced' && r.replacedBy.length === 0) problems.push(`${at}: Replaced but replaced_by is empty`);
    if (r.status === 'Accepted' && r.replacedBy.length) problems.push(`${at}: replaced_by is set but status is Accepted`);
    for (const id of [...r.replaces, ...r.replacedBy])
      if (!ids.has(id)) problems.push(`${at}: names ${id}, which doesn't exist`);
    if (kind === 'global') {
      if (!isVersion(r.since)) problems.push(`${at}: since isn't a version like 0.1.0`);
      if (r.changed && !isVersion(r.changed)) problems.push(`${at}: changed isn't a version like 0.2.0`);
      if (r.status === 'Replaced' && !r.changed) problems.push(`${at}: Replaced but changed (the version it happened in) is empty`);
      if (r.overrules.length) problems.push(`${at}: a global decision can't overrule; replace the other decision instead`);
    } else {
      for (const id of r.overrules) {
        if (!/^G-\d{4}$/.test(id)) problems.push(`${at}: overrules names ${id}, which isn't a global decision id (G-NNNN)`);
        else if (globalIds && !globalIds.has(id))
          problems.push(`${at}: overrules names ${id}, which isn't in the installed harness's global registry`);
      }
    }
  }
  return problems;
}

// The index lists every record and nothing else.
export function checkIndex(dir, records, label) {
  const indexPath = join(dir, 'index.md');
  if (!existsSync(indexPath)) return [`${label}/index.md doesn't exist`];
  // Links inside code spans are examples, not entries.
  const text = read(indexPath).replace(/`[^`\n]*`/g, '');
  const linked = [...text.matchAll(/\]\(([^)\s]+\.md)\)/g)].map((m) => m[1]).filter((f) => f !== 'README.md');
  const files = new Set(records.map((r) => r.file));
  const problems = [];
  for (const f of files) if (!linked.includes(f)) problems.push(`${label}/index.md doesn't list ${f}`);
  for (const f of new Set(linked)) if (!files.has(f)) problems.push(`${label}/index.md lists ${f}, which isn't a record`);
  for (const f of files) if (linked.filter((x) => x === f).length > 1) problems.push(`${label}/index.md lists ${f} more than once`);
  return problems;
}

export function checkRegistry(dir, kind, { label = dir, globalIds } = {}) {
  if (!existsSync(dir)) return { records: [], problems: [`${label} doesn't exist`] };
  const records = readRecords(dir, kind);
  return { records, problems: [...checkRecords(records, kind, { label, globalIds }), ...checkIndex(dir, records, label)] };
}
