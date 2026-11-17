import { useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import type { SyncResult } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useData } from '../data/DataProvider.tsx'
import { functions } from '../firebase.ts'
import { describeSync } from '../lib/syncStatus.ts'
import { IconRefresh } from './Icons.tsx'

// The sync stamp and the button that runs the sheet sync now.
export default function RefreshButton({ label = 'Refresh', stamp = true }: { label?: string; stamp?: boolean }) {
  const { sync } = useData()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
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
    <div className="actions">
      {failure ? <span className="error" role="alert">Refresh failed: {failure}</span> : stamp && <span className="stamp">{info.lastSynced}</span>}
      <button className="btn" onClick={() => void refresh()} disabled={busy}><IconRefresh />{busy ? 'Syncing…' : label}</button>
    </div>
  )
}

// Admins only: the last sync's error and any missing sheet columns. Nothing when the sync is healthy.
export function SyncProblems() {
  const { me } = useAuth()
  const { sync } = useData()
  const info = describeSync(sync)
  if (me?.role !== 'admin' || (!info.error && info.missingColumns.length === 0)) return null
  return (
    <div className="notice" role="status" style={{ marginTop: 16 }}>
      <span>
        {info.error && <>Sync error: {info.error}. </>}
        {info.missingColumns.length > 0 && <>Missing sheet columns: {info.missingColumns.join(', ')}.</>}
      </span>
    </div>
  )
}
