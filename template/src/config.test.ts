import { describe, expect, it } from 'vitest'
import { resolveSyncConfig } from './config'

describe('resolveSyncConfig', () => {
  it('is off outside production, whatever the address', () => {
    for (const context of ['local', 'deploy-preview', 'branch-deploy']) {
      expect(resolveSyncConfig(context, 'https://backend.example')).toEqual({ enabled: false, reason: 'not-production' })
    }
  })

  it('is off in production without an address, and on with one', () => {
    expect(resolveSyncConfig('production', '')).toEqual({ enabled: false, reason: 'no-address' })
    expect(resolveSyncConfig('production', 'https://backend.example')).toEqual({ enabled: true, url: 'https://backend.example' })
  })
})
