import { spawnSync } from 'node:child_process'

// Starts the throwaway backend for the `production` tests (playwright.config.ts), unless
// one is already running at BACKEND_TEST_URL, and removes it afterwards.

const throwaway = (args: string[], env: Record<string, string> = {}) =>
  spawnSync('bash', ['backend/throwaway.sh', ...args], { stdio: 'inherit', env: { ...process.env, ...env } })

export default function globalSetup() {
  if (!process.env.E2E_START_BACKEND) return undefined
  const started = throwaway([], {
    APP_ORIGIN: process.env.E2E_PRODUCTION_ORIGIN ?? '',
    BACKEND_TEST_PORT: new URL(process.env.E2E_BACKEND_URL ?? '').port,
  })
  if (started.status !== 0) throw new Error('backend/throwaway.sh could not start the throwaway backend (it needs Docker)')
  return () => void throwaway(['stop'])
}
