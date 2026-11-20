import { describe, expect, it } from 'vitest'
import { t } from '../text'
import { formatWhen, syncErrorText, syncLine, syncSummary, type SyncView } from './line'

const view = (patch: Partial<SyncView> = {}): SyncView => ({
  ended: false,
  offline: false,
  pending: 0,
  storageRefused: false,
  running: false,
  lastSyncedAt: '2026-01-02T10:00:00.000Z',
  lastError: null,
  lastErrorAt: null,
  ...patch,
})

describe('the sync line', () => {
  it('says each of its six states, with the count in singular and plural', () => {
    expect(syncLine(view({ ended: true })).text).toBe(t.syncSignInAgain)
    expect(syncLine(view({ ended: true, pending: 3 })).text).toBe(`${t.syncChanges(3)}${t.joiner}${t.syncSignInAgain}`)
    expect(syncLine(view({ offline: true })).text).toBe(t.syncOfflineIdle)
    expect(syncLine(view({ offline: true, pending: 1 })).text).toBe(`${t.syncOffline}${t.joiner}${t.syncChanges(1)}`)
    expect(syncLine(view({ lastError: 'other' })).text).toBe(t.syncFailed)
    expect(syncLine(view({ lastError: 'no-connection', pending: 3 })).text).toBe(`${t.syncFailed}${t.joiner}${t.syncChanges(3)}`)
    expect(syncLine(view({ pending: 1 })).text).toBe(t.syncChanges(1))
    expect(syncLine(view({ pending: 1234 })).text).toBe(t.syncChanges(1234))
    expect(syncLine(view({ storageRefused: true })).text).toBe(t.syncStorage)
    expect(syncLine(view()).text).toBe(t.syncAllSynced)
    expect(t.syncChanges(1)).not.toBe(t.syncChanges(2).replace('2', '1'))
  })

  it('takes the first rule that holds', () => {
    const everything = view({ ended: true, offline: true, lastError: 'other', pending: 2, storageRefused: true })
    expect(syncLine(everything).rule).toBe('sign-in')
    expect(syncLine({ ...everything, ended: false }).rule).toBe('offline')
    expect(syncLine({ ...everything, ended: false, offline: false }).rule).toBe('failed')
    expect(syncLine({ ...everything, ended: false, offline: false, lastError: null }).rule).toBe('changes')
    expect(syncLine({ ...everything, ended: false, offline: false, lastError: null, pending: 0 }).rule).toBe('storage')
    expect(syncLine(view()).rule).toBe('synced')
  })

  it('is not changed by a sync that is running', () => {
    expect(syncLine(view({ running: true, pending: 2 }))).toEqual(syncLine(view({ pending: 2 })))
    expect(syncLine(view({ running: true }))).toEqual(syncLine(view()))
  })

  it('is read out without the count, and not at all for a count alone', () => {
    expect(syncLine(view({ offline: true, pending: 5 })).announcement).toBe(t.syncOffline)
    expect(syncLine(view({ lastError: 'other', pending: 5 })).announcement).toBe(t.syncFailed)
    expect(syncLine(view({ ended: true, pending: 5 })).announcement).toBe(t.syncSignInAgain)
    expect(syncLine(view({ pending: 5 })).announcement).toBeNull()
    expect(syncLine(view()).announcement).toBe(t.syncAllSynced)
  })
})

describe('the details', () => {
  it('say what waits, and the last error in words', () => {
    expect(syncSummary(view())).toBe(t.syncAllSynced)
    expect(syncSummary(view({ pending: 1 }))).toBe(t.syncChanges(1))
    expect(syncErrorText('no-connection')).toBe(t.syncErrorNoConnection)
    expect(syncErrorText('other')).toBe(t.syncErrorOther)
  })

  it('write a time in the given language', () => {
    const when = '2026-01-02T10:00:00.000Z'
    expect(formatWhen(when, 'en')).toMatch(/2026/)
    expect(formatWhen(when, 'en')).not.toBe(formatWhen(when, 'nl'))
    expect(formatWhen('not a time')).toBe('not a time')
  })
})
