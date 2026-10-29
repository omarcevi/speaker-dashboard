import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { Status, StatusChange } from '../../../functions/src/model.ts'
import { setStatus, type Actor } from '../data/actions.ts'
import { db } from '../firebase.ts'
import { statusLabel } from './StatusChip.tsx'

const CHOICES: Status[] = ['approved', 'maybe', 'declined']

type HistoryItem = Omit<StatusChange, 'at'> & { id: string; at: { toDate(): Date } | null }

export function formatHistory(h: { to: Status; byName: string; at: { toDate(): Date } | null }): string {
  const when = h.at
    ? h.at.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'just now'
  return `${statusLabel(h.to)} by ${h.byName} · ${when}`
}

export default function DecisionBar({ submissionId, status, me }: { submissionId: string; status: Status; me: Actor }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const choose = async (to: Status) => {
    setBusy(true)
    setError(null)
    try {
      await setStatus(submissionId, status, to, me)
    } catch (e) {
      setError(`Couldn't save the decision: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="decision-bar">
      <div className="decision-btns">
        <span className="lbl">Decision</span>
        {CHOICES.map((c) => (
          <button key={c} className={status === c ? 'decision-btn current' : 'decision-btn'}
            style={{ background: `var(--st-${c})` }} aria-pressed={status === c}
            disabled={busy} onClick={() => choose(c)}>{statusLabel(c)}</button>
        ))}
        {error && <span className="inline-error" role="alert">{error}</span>}
      </div>
      {historyError && <div className="inline-error" role="alert">{historyError}</div>}
      {history.length > 0 && (
        <ul className="history">
          {history.map((h) => <li key={h.id}>{formatHistory(h)}</li>)}
        </ul>
      )}
    </div>
  )
}
