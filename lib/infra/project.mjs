// What a project's backend on the NAS is (G-0018, G-0023, G-0028): one dataset with two
// children, a snapshot task, and one custom app of three containers. Everything here is
// pure: the names, the Funnel path check and the compose file, generated from the project's
// name, its image, the site's origin and the dataset's mountpoint.

// Image versions, pinned; bumped by pull request.
export const TAILSCALE_IMAGE = 'ghcr.io/tailscale/tailscale:v1.104.7';
export const WATCHTOWER_IMAGE = 'nickfedor/watchtower:1.24.0';

// G-0023: every hour, each kept two weeks.
export const SNAPSHOTS = {
  schedule: { minute: '0', hour: '*', dom: '*', month: '*', dow: '*' },
  lifetime_value: 2,
  lifetime_unit: 'WEEK',
  naming_schema: 'auto-%Y-%m-%d_%H-%M',
};

// The tag every node of a project gets; the OAuth client may only write keys for it.
export const TAG = 'tag:harness';
// The mark that says spin-up made something, and for which project. Teardown deletes only
// what carries it.
export const MARK = 'harness:project';
export const LABEL = 'harness.project';
// The Netlify site's mark: an environment variable of the site, holding owner/name.
export const SITE_MARK = 'HARNESS_REPOSITORY';
// The registry entry on the NAS for pulling a private project's image (G-0030).
export const REGISTRY_NAME = 'harness-ghcr';

// The port the admin screen is served on, to the tailnet only (never through Funnel).
export const ADMIN_PORT = 8443;
const POCKETBASE = '127.0.0.1:8090';

export const PROJECT_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
export function checkProjectName(name) {
  if (!name || !PROJECT_NAME.test(name) || name.endsWith('-')) throw new Error(`"${name ?? ''}" isn't a project name: lower-case letters, digits and hyphens`);
  return name;
}

export const REPOSITORY = /^[A-Za-z0-9-]+\/[\w.-]+$/;
export function checkRepository(repository) {
  if (!REPOSITORY.test(repository ?? '')) throw new Error(`"${repository ?? ''}" isn't a repository as owner/name`);
  return repository;
}

// The project's image, as the backend workflow publishes it.
export const imageOf = (repository) => `ghcr.io/${repository.toLowerCase()}-backend:stable`;

// The paths the internet may reach (backend/funnel.json): a list of prefixes under /api/,
// never /api/ itself, the admin screen or the superusers. Returns the list; throws with
// every reason it refuses.
export function checkFunnelPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('backend/funnel.json must be a non-empty JSON list of paths');
  const problems = [];
  const seen = new Set();
  for (const p of paths) {
    if (typeof p !== 'string') {
      problems.push(`${JSON.stringify(p)} isn't a path`);
      continue;
    }
    const lower = p.toLowerCase();
    if (/^\/api\/?$/i.test(p)) problems.push(`${JSON.stringify(p)} would open /api/ whole`);
    else if (!/^\/api\/[A-Za-z0-9_./-]+$/.test(p)) problems.push(`${JSON.stringify(p)} isn't a path under /api/`);
    else if (p.split('/').some((s) => s === '..' || s === '.')) problems.push(`${JSON.stringify(p)} holds . or ..`);
    else if (lower.includes('_superusers')) problems.push(`${JSON.stringify(p)} would open the superusers`);
    if (lower.startsWith('/_/') || lower === '/_') problems.push(`${JSON.stringify(p)} would open the admin screen`);
    if (seen.has(p)) problems.push(`${JSON.stringify(p)} is there twice`);
    seen.add(p);
  }
  if (problems.length) throw new Error(`backend/funnel.json is refused: ${problems.join('; ')}`);
  return paths;
}

// The origin of an https address, or an error.
export function originOf(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`"${url}" isn't an address`);
  }
  if (u.protocol !== 'https:') throw new Error(`"${url}" isn't an https address`);
  return u.origin;
}

// The Tailscale serve configuration: Funnel on 443 with only the allowed paths, and the
// whole of PocketBase (its admin screen) on the admin port, which only the tailnet reaches.
// `${TS_CERT_DOMAIN}` is filled in by the container; in a compose file it is written `$$`.
export function serveConfig(paths) {
  const domain = '${TS_CERT_DOMAIN}';
  const handlers = Object.fromEntries(checkFunnelPaths(paths).map((p) => [p, { Proxy: `http://${POCKETBASE}${p}` }]));
  return {
    TCP: { 443: { HTTPS: true }, [ADMIN_PORT]: { HTTPS: true } },
    Web: {
      [`${domain}:443`]: { Handlers: handlers },
      [`${domain}:${ADMIN_PORT}`]: { Handlers: { '/': { Proxy: `http://${POCKETBASE}` } } },
    },
    AllowFunnel: { [`${domain}:443`]: true },
  };
}

// The compose configuration of a project's app. `authKey` only for the first start;
// `pullToken` only while the repository is private (G-0030), for Watchtower's pulls.
export function backendCompose({ project, repository, siteOrigin, mountpoint, paths, authKey, pullToken }) {
  for (const [name, value] of Object.entries({ project, repository, siteOrigin, mountpoint })) if (!value) throw new Error(`the app's configuration needs ${name}`);
  checkProjectName(project);
  checkRepository(repository);
  const origin = originOf(siteOrigin);
  const label = { [LABEL]: project };
  const tailscale = {
    TS_HOSTNAME: project,
    TS_STATE_DIR: '/var/lib/tailscale',
    TS_SERVE_CONFIG: '/config/serve.json',
    TS_USERSPACE: 'true',
    TS_AUTH_ONCE: 'true',
  };
  if (authKey) tailscale.TS_AUTHKEY = authKey;
  const watchtower = {
    WATCHTOWER_LABEL_ENABLE: 'true',
    WATCHTOWER_SCOPE: project,
    WATCHTOWER_POLL_INTERVAL: '300',
    WATCHTOWER_CLEANUP: 'true',
  };
  if (pullToken) Object.assign(watchtower, { REPO_USER: repository.split('/')[0], REPO_PASS: pullToken });
  return {
    services: {
      tailscale: {
        image: TAILSCALE_IMAGE,
        hostname: project,
        restart: 'unless-stopped',
        environment: tailscale,
        volumes: [`${mountpoint}/tailscale:/var/lib/tailscale`],
        configs: [{ source: 'serve', target: '/config/serve.json' }],
        labels: label,
      },
      pocketbase: {
        image: imageOf(repository),
        restart: 'unless-stopped',
        network_mode: 'service:tailscale',
        depends_on: ['tailscale'],
        command: ['serve', `--http=${POCKETBASE}`, '--dir=/pb_data', '--migrationsDir=/pb_migrations', '--hooksDir=/pb_hooks', '--automigrate=false', `--origins=${origin}`],
        volumes: [`${mountpoint}/pb_data:/pb_data`],
        healthcheck: { test: ['CMD', 'wget', '-q', '--spider', `http://${POCKETBASE}/api/health`], interval: '30s', timeout: '5s', retries: 3, start_period: '15s' },
        labels: { ...label, 'com.centurylinklabs.watchtower.enable': 'true', 'com.centurylinklabs.watchtower.scope': project },
      },
      watchtower: {
        image: WATCHTOWER_IMAGE,
        restart: 'unless-stopped',
        environment: watchtower,
        volumes: ['/var/run/docker.sock:/var/run/docker.sock'],
        labels: { ...label, 'com.centurylinklabs.watchtower.scope': project },
      },
    },
    configs: {
      // `$$`: a compose file would otherwise fill ${TS_CERT_DOMAIN} in itself, with nothing.
      // (A function: as a replacement string, `$$` would itself become one `$`.)
      serve: { content: JSON.stringify(serveConfig(paths), null, 2).replaceAll('${TS_CERT_DOMAIN}', () => '$${TS_CERT_DOMAIN}') },
    },
  };
}

// Whether a compose configuration is one spin-up made for `project`.
export const madeFor = (compose, project) => Object.values(compose?.services ?? {}).some((s) => s?.labels?.[LABEL] === project);

// A dataset's user property, whatever shape the NAS gives it in.
export function userProperty(dataset, key) {
  const props = dataset?.user_properties;
  if (!props) return undefined;
  if (Array.isArray(props)) return props.find((p) => p.key === key)?.value;
  const v = props[key];
  return v && typeof v === 'object' ? (v.value ?? v.parsed ?? v.rawvalue) : v;
}
