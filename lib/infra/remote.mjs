// Starting a workflow of the private infrastructure repository and reading back what its job
// recorded (G-0026). The run is named after a request id, which is how it is found again.
// The job prints its result as marker lines (base64 chunks) in its log; the log of a private
// repository is only readable by those who may run its workflows.
import { randomBytes } from 'node:crypto';
import { RUNNER_NAME, findRunner } from './runner.mjs';

export const MARKER = 'harness-result';
const CHUNK = 3000;

export const newRequestId = () => randomBytes(8).toString('hex');

// The marker lines a job prints for its result { code, stdout, stderr }.
export function resultLines(result) {
  const encoded = Buffer.from(JSON.stringify(result), 'utf8').toString('base64');
  const chunks = encoded.match(new RegExp(`.{1,${CHUNK}}`, 'g')) ?? [''];
  return chunks.map((c, i) => `${MARKER} ${i + 1}/${chunks.length} ${c}`);
}

// The result in a job's log, or undefined when it holds none. Each log line starts with a
// timestamp.
export function parseResult(log) {
  const parts = new Map();
  let total;
  for (const line of String(log).split(/\r?\n/)) {
    const m = line.match(new RegExp(`(?:^|\\s)${MARKER} (\\d+)/(\\d+) ([A-Za-z0-9+/=]+)\\s*$`));
    if (!m) continue;
    parts.set(Number(m[1]), m[3]);
    total = Number(m[2]);
  }
  if (!total || parts.size !== total) return undefined;
  const encoded = Array.from({ length: total }, (_, i) => parts.get(i + 1)).join('');
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Starts `workflow` with `inputs`, waits for its run and returns { run, result }.
// `gh` runs gh and returns its output. While the run waits for the runner on the NAS and the
// runner is offline, it is cancelled: a NAS call should never run later, unattended.
export async function runWorkflow({ repo, workflow, inputs = {}, gh, wait = sleep, log = () => {}, every = 3000, appearTries = 40, finishTries = 400, queuedTries = 20, needsRunner = true }) {
  const requestId = newRequestId();
  const fields = Object.entries({ ...inputs, 'request-id': requestId }).flatMap(([k, v]) => ['-f', `${k}=${v}`]);
  gh(['workflow', 'run', workflow, '--repo', repo, ...fields]);
  const title = `${workflow.replace(/\.ya?ml$/, '')} ${requestId}`;

  let run;
  for (let i = 0; i < appearTries && !run; i++) {
    await wait(every);
    const runs = JSON.parse(gh(['run', 'list', '--repo', repo, '--workflow', workflow, '--limit', '30', '--json', 'databaseId,displayTitle,status,conclusion,url']));
    run = runs.find((r) => r.displayTitle === title);
  }
  if (!run) throw new Error(`the ${workflow} run for request ${requestId} did not appear on ${repo}`);
  log(`  run: ${run.url}`);

  const view = () => JSON.parse(gh(['run', 'view', String(run.databaseId), '--repo', repo, '--json', 'status,conclusion,url,jobs']));
  let state = run;
  let queued = 0;
  for (let i = 0; i < finishTries && state.status !== 'completed'; i++) {
    await wait(every);
    state = view();
    queued = state.status === 'queued' || state.status === 'waiting' || state.status === 'pending' ? queued + 1 : 0;
    if (needsRunner && queued >= queuedTries && findRunner(repo, gh)?.status !== 'online') {
      gh(['run', 'cancel', String(run.databaseId), '--repo', repo]);
      throw new Error(`the runner ${RUNNER_NAME} on the NAS is offline, so the run was cancelled: ${run.url}\nSee harness infra runner status.`);
    }
  }
  if (state.status !== 'completed') throw new Error(`the run is still going after a long wait: ${run.url}`);
  const full = state.jobs ? state : view();

  // The log may take a moment to be there after the run completes. Each job that ran may
  // have recorded a result; a skipped job has no log, and one that failed before its harness
  // step has none either, so after a few tries one result is enough.
  const ran = (full.jobs ?? []).filter((j) => j.conclusion !== 'skipped');
  const found = new Map();
  for (let i = 0; i < 10 && found.size < ran.length && !(found.size && i >= 3); i++) {
    if (i > 0) await wait(every);
    for (const job of ran) {
      if (found.has(job.databaseId)) continue;
      let text = '';
      // A log holds colour codes, which gh refuses to print unless told to (an older gh
      // doesn't know the flag, and prints them anyway).
      for (const flags of [['--allow-escape-sequences'], []]) {
        try {
          text = gh(['api', ...flags, `repos/${repo}/actions/jobs/${job.databaseId}/logs`]);
          break;
        } catch {
          // Not there yet, or an older gh.
        }
      }
      const result = parseResult(text);
      if (result) found.set(job.databaseId, result);
    }
  }
  const results = (full.jobs ?? []).map((job) => ({ job, result: found.get(job.databaseId) }));
  return { run: { ...run, conclusion: full.conclusion }, result: results.find((r) => r.result)?.result, results };
}
