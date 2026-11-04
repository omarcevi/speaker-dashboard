import { useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import type { SyncResult } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useData } from '../data/DataProvider.tsx'
import { functions } from '../firebase.ts'
import { describeSync } from '../lib/syncStatus.ts'

export default function RefreshButton() {
  const { me } = useAuth()
  const { sync } = useData()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const isAdmin = me?.role === 'admin'
  const info = describeSync(sync)

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
      <span className="muted">{info.lastSynced}</span>
      {failure && <span className="error">Refresh failed: {failure}</span>}
      {isAdmin && info.error && <span className="error">Sync error: {info.error}</span>}
      {isAdmin && info.missingColumns.length > 0 && (
        <span className="error">Missing columns: {info.missingColumns.join(', ')}</span>
      )}
      {isAdmin && (
        <span className="muted">Don't sort or delete rows in the Form Responses tab; use filter views.</span>
      )}
    </div>
  )
}
