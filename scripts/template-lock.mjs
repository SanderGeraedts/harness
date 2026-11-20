#!/usr/bin/env node
// Refreshes template/pnpm-lock.yaml: fills the template into a throwaway folder, resolves
// its dependencies there, and copies the lockfile back. Run it after changing
// template/package.json:   node scripts/template-lock.mjs
// A created project starts from this lockfile, so it gets the versions the template was
// tested with; `harness create` then adds the harness itself to it.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEMPLATE_DIR, copyTemplate, resolveOptions } from '../lib/create.mjs';

const work = mkdtempSync(join(tmpdir(), 'harness-template-lock-'));
try {
  const dir = join(work, 'project');
  copyTemplate(dir, resolveOptions({ name: 'project', purpose: 'Refresh the lockfile.', engineers: [] }));
  const r = spawnSync('pnpm install --lockfile-only', { cwd: dir, shell: true, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  copyFileSync(join(dir, 'pnpm-lock.yaml'), join(TEMPLATE_DIR, 'pnpm-lock.yaml'));
  console.log('✓ wrote template/pnpm-lock.yaml');
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 3 });
}
