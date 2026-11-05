import type { SyncMeta } from '../../../functions/src/model.ts'

export function describeSync(sync: SyncMeta | null): { lastSynced: string; error: string | null; missingColumns: string[] } {
  return {
    lastSynced: sync?.lastSyncedAt ? 'Last synced ' + new Date(sync.lastSyncedAt.toMillis()).toLocaleString() : 'Not synced yet',
    error: sync?.error ?? null,
    missingColumns: sync?.missingColumns ?? [],
  }
}
