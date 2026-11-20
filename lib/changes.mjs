// harness changes <from> [to]: the global decisions added, changed or replaced after
// version <from>, up to and including <to> (default: the installed version). For the PR
// that bumps the harness in a project (G-0005).
//
// It reads the installed copy only: every global decision carries `since` (the version
// that added it) and, once its status changed or it was redacted, `changed` (the version
// that did so). So run it after installing the new version.
import { compareVersions, isVersion } from './frontmatter.mjs';
import { GLOBAL_DECISIONS_DIR, harnessVersion } from './paths.mjs';
import { readRecords } from './registry.mjs';

const within = (v, from, to) => v && compareVersions(v, from) > 0 && compareVersions(v, to) <= 0;

export function findChanges(from, to, globalDir = GLOBAL_DECISIONS_DIR) {
  const records = readRecords(globalDir, 'global');
  const added = records.filter((r) => within(r.since, from, to));
  const touched = records.filter((r) => within(r.changed, from, to) && !added.includes(r));
  return {
    added,
    replaced: touched.filter((r) => r.status === 'Replaced'),
    changed: touched.filter((r) => r.status !== 'Replaced'),
  };
}

export function renderChanges({ added, replaced, changed }, from, to) {
  const v = (x) => `v${String(x).replace(/^v/, '')}`;
  if (added.length + replaced.length + changed.length === 0)
    return `No global decisions were added, changed or replaced between ${v(from)} and ${v(to)}.\n`;
  const line = (r, extra = '') => `- ${r.id} ${r.title}${extra}: ${r.description}`;
  const section = (title, rows, extra = () => '') =>
    rows.length ? `## ${title}\n\n${rows.map((r) => line(r, extra(r))).join('\n')}\n` : '';
  return [
    `# Global decisions, ${v(from)} to ${v(to)}\n`,
    'Per decision: open a task to conform, or record a project decision that overrules it (G-0005).\n',
    section('Added', added),
    section('Replaced', replaced, (r) => ` (replaced by ${r.replacedBy.join(', ')})`),
    section('Changed', changed),
  ]
    .filter(Boolean)
    .join('\n');
}

export function main(args) {
  const [from, to = harnessVersion()] = args.filter((a) => !a.startsWith('--'));
  if (!isVersion(from) || !isVersion(to)) {
    console.error('Usage: harness changes <fromTag> [toTag]   e.g. harness changes v0.1.0 v0.2.0');
    return 1;
  }
  if (compareVersions(to, harnessVersion()) > 0) {
    console.error(`✗ ${to} is newer than the installed harness (${harnessVersion()}): install it first, then run this again.`);
    return 1;
  }
  if (compareVersions(from, to) > 0) {
    console.error(`✗ ${from} is newer than ${to}.`);
    return 1;
  }
  process.stdout.write(renderChanges(findChanges(from, to), from, to));
  return 0;
}
