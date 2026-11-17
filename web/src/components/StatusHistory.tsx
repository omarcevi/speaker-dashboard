import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { Status, StatusChange } from '../../../functions/src/model.ts'
import { db } from '../firebase.ts'
import { formatWhen } from '../lib/syncStatus.ts'
import { statusLabel } from './StatusChip.tsx'

type HistoryItem = Omit<StatusChange, 'at'> & { id: string; at: { toDate(): Date } | null }

const when = (at: { toDate(): Date } | null) => (at ? formatWhen(at.toDate().getTime()) : 'just now')

export function formatHistory(h: { to: Status; byName: string; at: { toDate(): Date } | null }): string {
  return `${statusLabel(h.to)} by ${h.byName} · ${when(h.at)}`
}

// The latest decision as "by <name> · <when>" next to the status pill; earlier changes behind a disclosure.
export default function StatusHistory({ submissionId }: { submissionId: string }) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'reviews', submissionId, 'history'), orderBy('at', 'desc'))
    return onSnapshot(q, (snap) => {
      setHistoryError(null)
      setHistory(snap.docs.map((d) => ({ ...(d.data() as HistoryItem), id: d.id })))
    }, (e) => {
      console.error('History listener failed', e)
      setHistoryError("Couldn't load the decision history")
    })
  }, [submissionId])

  if (historyError) return <span className="inline-error" role="alert">{historyError}</span>
  const [latest, ...older] = history
  if (!latest) return <span>since it was submitted</span>
  return (
    <>
      <span>by {latest.byName} · {when(latest.at)}</span>
      {older.length > 0 && (
        <details className="history-list">
          <summary>History ({history.length})</summary>
          <ul>{history.map((h) => <li key={h.id}>{formatHistory(h)}</li>)}</ul>
        </details>
      )}
    </>
  )
}
