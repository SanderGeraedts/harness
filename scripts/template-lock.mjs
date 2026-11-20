#!/usr/bin/env node
// Refreshes the lockfiles new projects start from: template/pnpm-lock.yaml, and
// template-sync/pnpm-lock.yaml for a project that syncs. For each it fills the template into
// a throwaway folder, resolves its dependencies there, and copies the lockfile back. Run it
// after changing either package.json:   node scripts/template-lock.mjs
// A created project starts from its lockfile, so it gets the versions the template was
// tested with; `harness create` then adds the harness itself to it.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEMPLATE_DIR, TEMPLATE_SYNC_DIR, copyTemplate, resolveOptions } from '../lib/create.mjs';

const work = mkdtempSync(join(tmpdir(), 'harness-template-lock-'));
try {
  for (const [sync, target] of [
    [false, TEMPLATE_DIR],
    [true, TEMPLATE_SYNC_DIR],
  ]) {
    const dir = join(work, sync ? 'syncs' : 'local');
    copyTemplate(dir, resolveOptions({ name: 'project', purpose: 'Refresh the lockfile.', engineers: [], sync }));
    const r = spawnSync('pnpm install --lockfile-only', { cwd: dir, shell: true, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
    copyFileSync(join(dir, 'pnpm-lock.yaml'), join(target, 'pnpm-lock.yaml'));
    console.log(`✓ wrote ${sync ? 'template-sync' : 'template'}/pnpm-lock.yaml`);
  }
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 3 });
}
