import { spawnSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'

// End-to-end tests, in two projects:
//
// - `phone`: the production-style build on the seeded demo data (G-0019), as every preview
//   runs. Build first: pnpm run build.
// - `production`: a production build that was given a backend address, against a throwaway
//   backend on an empty database: the sign-in, the account screen and sync. The build is
//   made here, into dist-e2e. The backend is the one at BACKEND_TEST_URL when that is set;
//   otherwise e2e/global-setup.ts starts backend/throwaway.sh, which needs Docker. On a
//   machine with neither, this project is left out, and says so. CI always runs it.
//   Never give it the address of a real backend.
//
// E2E_PORT picks another port, so parallel worktrees don't share (or reuse) a server. The
// production build is served on the next port.
const port = Number(process.env.E2E_PORT ?? 4173)
const productionPort = port + 1
const backendPort = Number(process.env.BACKEND_TEST_PORT ?? 8090)
const backendUrl = process.env.BACKEND_TEST_URL ?? `http://127.0.0.1:${backendPort}`
const productionOrigin = `http://localhost:${productionPort}`

const hasDocker = () => spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0
const withBackend = !!process.env.BACKEND_TEST_URL || !!process.env.CI || hasDocker()
if (!withBackend) console.warn('No throwaway backend (no BACKEND_TEST_URL, no Docker): the tests of the sign-in and sync are left out.')

// For e2e/global-setup.ts and the tests.
process.env.E2E_BACKEND_URL = backendUrl
process.env.E2E_PRODUCTION_ORIGIN = productionOrigin
process.env.E2E_START_BACKEND = withBackend && !process.env.BACKEND_TEST_URL ? '1' : ''

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', testIgnore: /production\//, use: { ...devices['Pixel 7'] } },
    ...(withBackend ? [{ name: 'production', testMatch: /production\/.*\.spec\.ts/, use: { ...devices['Pixel 7'], baseURL: productionOrigin } }] : []),
  ],
  webServer: [
    {
      command: `pnpm run preview --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
    },
    ...(withBackend
      ? [
          {
            // CONTEXT and BACKEND_URL are what the host gives a production build (G-0019).
            command: `pnpm exec vite build --outDir dist-e2e && pnpm exec vite preview --outDir dist-e2e --port ${productionPort} --strictPort`,
            url: productionOrigin,
            env: { CONTEXT: 'production', BACKEND_URL: backendUrl },
            reuseExistingServer: false,
            timeout: 120_000,
          },
        ]
      : []),
  ],
})
