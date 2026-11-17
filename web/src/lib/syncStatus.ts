import type { SyncMeta } from '../../../functions/src/model.ts'

// One date format across the app: "17 Nov 2026, 10:21".
export function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function describeSync(sync: SyncMeta | null): { lastSynced: string; error: string | null; missingColumns: string[] } {
  return {
    lastSynced: sync?.lastSyncedAt ? 'Last synced ' + formatWhen(sync.lastSyncedAt.toMillis()) : 'Not synced yet',
    error: sync?.error ?? null,
    missingColumns: sync?.missingColumns ?? [],
  }
}
