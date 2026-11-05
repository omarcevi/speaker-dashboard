import { useState } from 'react'
import type { Status } from '../../../functions/src/model.ts'
import { setStatus, type Actor } from '../data/actions.ts'

const CHOICES: { status: Status; label: string }[] = [
  { status: 'approved', label: 'Approve' },
  { status: 'maybe', label: 'Maybe' },
  { status: 'declined', label: 'Decline' },
]

export default function DecisionBar({ submissionId, status, me }: { submissionId: string; status: Status; me: Actor }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        {CHOICES.map(({ status: c, label }) => (
          <button key={c} className={status === c ? 'decision-btn current' : 'decision-btn'}
            style={{ background: `var(--st-${c})` }} aria-pressed={status === c}
            disabled={busy} onClick={() => choose(c)}>{label}</button>
        ))}
        {status !== 'pending' && (
          <button className="link-btn" disabled={busy} onClick={() => choose('pending')}>Reset to Pending</button>
        )}
        {error && <span className="inline-error" role="alert">{error}</span>}
      </div>
    </div>
  )
}
