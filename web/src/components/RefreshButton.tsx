import { useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import type { SyncResult } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useData } from '../data/DataProvider.tsx'
import { functions } from '../firebase.ts'

export default function RefreshButton() {
  const { me } = useAuth()
  const { sync } = useData()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const isAdmin = me?.role === 'admin'

  async function refresh() {
    setBusy(true)
    setFailure(null)
    try {
      await httpsCallable<unknown, SyncResult>(functions, 'syncNow')()
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="refresh">
      <button onClick={() => void refresh()} disabled={busy}>{busy ? 'Syncing…' : 'Refresh'}</button>
      <span className="muted">
        {sync ? `Last synced ${new Date(sync.lastSyncedAt.toMillis()).toLocaleString()}` : 'Not synced yet'}
      </span>
      {failure && <span className="error">Refresh failed: {failure}</span>}
      {isAdmin && sync?.error && <span className="error">Sync error: {sync.error}</span>}
      {isAdmin && sync && sync.missingColumns.length > 0 && (
        <span className="error">Missing columns: {sync.missingColumns.join(', ')}</span>
      )}
      {isAdmin && (
        <span className="muted">Don't sort or delete rows in the Form Responses tab; use filter views.</span>
      )}
    </div>
  )
}
