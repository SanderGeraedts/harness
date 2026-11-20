#!/usr/bin/env node
// Creates a project with `harness create`, from this checkout, without GitHub: for the
// harness's own CI job that tests the template's backend, and for trying the template by
// hand.
//   node scripts/make-project.mjs <dir> [--sync | --no-sync]
// The harness is packed and installed into the project from that tarball, as the self-test
// does; the tarball stays next to the project, which depends on it. Nobody is signed in
// here, so the Engineer is a made-up login.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../lib/create.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [dir, ...flags] = process.argv.slice(2);
if (!dir || dir.startsWith('--')) {
  console.error('usage: node scripts/make-project.mjs <dir> [--sync | --no-sync]');
  process.exit(2);
}
const target = resolve(dir);
const parent = dirname(target);
mkdirSync(parent, { recursive: true });
const packed = spawnSync(`pnpm pack --pack-destination "${parent}"`, { cwd: root, shell: true, encoding: 'utf8' });
const tarball = readdirSync(parent).find((f) => f.endsWith('.tgz'));
if (packed.status !== 0 || !tarball) {
  console.error(`✗ pnpm pack failed:\n${packed.stdout}${packed.stderr}`);
  process.exit(1);
}
const args = [
  basename(target), '--dir', target, '--purpose', 'Try the template.', '--engineer', 'engineer-one', '--no-github',
  '--git-name', 'Template', '--git-email', 'template@example.invalid', '--harness-package', join(parent, tarball), ...flags,
];
process.exitCode = await main(args, parent, { getLogin: () => 'engineer-one', interactive: false });
