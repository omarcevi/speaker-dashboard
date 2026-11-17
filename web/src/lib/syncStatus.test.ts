import { describe, expect, it } from 'vitest'
import type { SyncMeta } from '../../../functions/src/model.ts'
import { describeSync, formatWhen } from './syncStatus.ts'

const ts = (ms: number) => ({ toMillis: () => ms })

describe('describeSync', () => {
  it('handles no meta doc', () => {
    expect(describeSync(null)).toEqual({ lastSynced: 'Not synced yet', error: null, missingColumns: [] })
  })
  it('handles a first-ever failed sync (error only, no lastSyncedAt)', () => {
    const meta: SyncMeta = { error: 'boom', lastErrorAt: ts(5) }
    expect(describeSync(meta)).toEqual({ lastSynced: 'Not synced yet', error: 'boom', missingColumns: [] })
  })
  it('handles a full doc', () => {
    const meta: SyncMeta = {
      lastSyncedAt: ts(1_000_000), error: null, lastErrorAt: null,
      added: 1, updated: 0, removed: 0, total: 1, missingColumns: ['email'],
    }
    expect(describeSync(meta)).toEqual({
      lastSynced: 'Last synced ' + formatWhen(1_000_000), error: null, missingColumns: ['email'],
    })
  })
})

describe('formatWhen', () => {
  it('is day, short month, year and 24-hour time, with no seconds', () => {
    const at = new Date(2026, 10, 17, 10, 21, 40).getTime()
    expect(formatWhen(at)).toBe('17 Nov 2026, 10:21')
  })
})
