import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { Status, StatusChange } from '../../../functions/src/model.ts'
import { db } from '../firebase.ts'
import { statusLabel } from './StatusChip.tsx'

type HistoryItem = Omit<StatusChange, 'at'> & { id: string; at: { toDate(): Date } | null }

export function formatHistory(h: { to: Status; byName: string; at: { toDate(): Date } | null }): string {
  const when = h.at
    ? h.at.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'just now'
  return `${statusLabel(h.to)} by ${h.byName} · ${when}`
}

export default function StatusHistory({ submissionId }: { submissionId: string }) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    setHistory([])
    setHistoryError(null)
    const q = query(collection(db, 'reviews', submissionId, 'history'), orderBy('at', 'desc'))
    return onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => ({ ...(d.data() as HistoryItem), id: d.id })))
    }, (e) => {
      console.error('History listener failed', e)
      setHistoryError(`Couldn't load history: ${e.message}`)
    })
  }, [submissionId])

  return (
    <>
      {historyError && <div className="inline-error" role="alert">{historyError}</div>}
      {history.length > 0 && (
        <ul className="history">
          {history.map((h) => <li key={h.id}>{formatHistory(h)}</li>)}
        </ul>
      )}
    </>
  )
}
