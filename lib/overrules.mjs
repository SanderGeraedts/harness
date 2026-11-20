// harness overrules: the project decisions that overrule global ones (G-0002).
import { join } from 'node:path';
import { GLOBAL_DECISIONS_DIR } from './paths.mjs';
import { DEFAULT_DECISIONS_DIR, readRecords } from './registry.mjs';

export function findOverrules(projectDir, globalDir = GLOBAL_DECISIONS_DIR) {
  const globals = new Map(readRecords(globalDir, 'global').map((g) => [g.id, g]));
  return readRecords(join(projectDir, DEFAULT_DECISIONS_DIR), 'project')
    .filter((r) => r.type === 'decision' && r.status === 'Accepted' && r.overrules.length)
    .flatMap((r) =>
      r.overrules.map((id) => ({
        global: id,
        globalTitle: globals.get(id)?.title,
        globalStatus: globals.get(id)?.status,
        decision: r.id,
        title: r.title,
        file: `${DEFAULT_DECISIONS_DIR}/${r.file}`,
      })),
    );
}

export function main(args, cwd = process.cwd()) {
  const rows = findOverrules(cwd);
  if (rows.length === 0) {
    console.log('No project decision overrules a global one.');
    return 0;
  }
  for (const o of rows) {
    const what = o.globalTitle ? `"${o.globalTitle}"${o.globalStatus === 'Replaced' ? ' (Replaced)' : ''}` : '(not in the installed harness)';
    console.log(`${o.global} ${what}\n  overruled by ${o.decision} "${o.title}" (${o.file})`);
  }
  return 0;
}
