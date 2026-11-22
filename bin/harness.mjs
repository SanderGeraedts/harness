#!/usr/bin/env node
// The harness's command line. Run it from a project's root: pnpm exec harness <command>.

const USAGE = `harness <command>

  role                           print engineer or requester for the signed-in GitHub account
  check                          everything CI checks: tasks, decisions, overrules, generated files
  tasks-index [--check] [dir]    write (or check) the task index; dir defaults to docs/tasks
  overrules                      list the project decisions that overrule global ones
  changes <fromTag> [toTag]      global decisions added, changed or replaced between two versions
  waiting [dir...]               what waits on a human, for this or several project folders
  backend [start|status|smoke|stop]
                                 a throwaway backend from the versions backend/Dockerfile
                                 pins, without Docker; smoke runs the smoke test against it
  sync                           copy or refresh the files the harness generates in a project
  init [login...] [--default-branch <name>]
                                 set an existing repository up, with these Engineers
  adopt [--write] [login...] [--default-branch <name>]
                                 for a repository that already has registries: report what is
                                 there, what would be added and which project decisions look
                                 like a global one; --write adds what is missing, overwrites nothing
  hooks                          point git at .githooks (the project's prepare script)
  protect <check>... [--repo owner/name] [--dry-run]
                                 create or update the ruleset on the default branch
  nas [--remote] <method> [params-json] [--job] [--confirmed] | --fingerprint
                                 call the TrueNAS API; --remote through the workflow on the
                                 runner on the NAS (the Engineer only)
  infra <command>                the private infrastructure repository and the runner on the
                                 NAS (the Engineer only); harness infra --help lists them
  create <name> [options]        spin up a new project from the template (the Engineer only);
                                 harness create --help lists the options
`;

const COMMANDS = {
  role: () => import('../lib/role.mjs').then((m) => m.main),
  check: () => import('../lib/check.mjs').then((m) => m.main),
  'tasks-index': () => import('../lib/tasks-index.mjs').then((m) => m.main),
  overrules: () => import('../lib/overrules.mjs').then((m) => m.main),
  changes: () => import('../lib/changes.mjs').then((m) => m.main),
  waiting: () => import('../lib/waiting.mjs').then((m) => m.main),
  backend: () => import('../lib/backend.mjs').then((m) => m.main),
  sync: () => import('../lib/sync.mjs').then((m) => m.main),
  init: () => import('../lib/init.mjs').then((m) => m.main),
  adopt: () => import('../lib/adopt.mjs').then((m) => m.main),
  hooks: () => import('../lib/sync.mjs').then((m) => m.hooksMain),
  protect: () => import('../lib/protect.mjs').then((m) => m.main),
  nas: () => import('../lib/nas.mjs').then((m) => m.main),
  create: () => import('../lib/create.mjs').then((m) => m.main),
  infra: () => import('../lib/infra.mjs').then((m) => m.main),
};

const [command, ...args] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h' || command === 'help') {
  process.stdout.write(USAGE);
  process.exit(command ? 0 : 1);
}
if (command === '--version' || command === '-v') {
  const { harnessVersion } = await import('../lib/paths.mjs');
  console.log(harnessVersion());
  process.exit(0);
}
if (!Object.hasOwn(COMMANDS, command)) {
  console.error(`harness: unknown command "${command}"\n\n${USAGE}`);
  process.exit(1);
}
const main = await COMMANDS[command]();
process.exitCode = (await main(args)) ?? 0;
