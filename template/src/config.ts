// G-0019: only a production build can reach the backend, and only when it was given an
// address. Previews, local development and tests never get one (vite.config.ts doesn't read
// it for them), so they run on seeded demo data and can't reach real data.

export type SyncConfig = { enabled: true; url: string } | { enabled: false; reason: 'not-production' | 'no-address' }

export function resolveSyncConfig(context: string, backendUrl: string): SyncConfig {
  if (context !== 'production') return { enabled: false, reason: 'not-production' }
  if (!backendUrl) return { enabled: false, reason: 'no-address' }
  return { enabled: true, url: backendUrl }
}

export const deployContext = __DEPLOY_CONTEXT__
/** Whether this build syncs, and with what. The sync engine (src/sync/) starts from this. */
export const syncConfig = resolveSyncConfig(__DEPLOY_CONTEXT__, __BACKEND_URL__)
/** Everything but production starts with demo data. */
export const seedDemoData = deployContext !== 'production'
