import { describe, expect, it } from 'vitest'
import type { SyncMeta } from '../../../functions/src/model.ts'
import { describeSync } from './syncStatus.ts'

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
      lastSynced: 'Last synced ' + new Date(1_000_000).toLocaleString(), error: null, missingColumns: ['email'],
    })
  })
})
