import { useState } from 'react'
import type { Status } from '../../../functions/src/model.ts'
import { setStatus, type Actor } from '../data/actions.ts'
import StatusChip from './StatusChip.tsx'
import StatusHistory from './StatusHistory.tsx'

const CHOICES: { status: Status; label: string }[] = [
  { status: 'approved', label: 'Approve' },
  { status: 'maybe', label: 'Maybe' },
  { status: 'declined', label: 'Decline' },
]

// Admins decide with a segmented control; members see the status. Pressing the current decision again does nothing,
// so a double click can't undo it; going back to Pending is the explicit "Reset to pending" link. The full version adds
// the status pill and the latest change; the compact one in the floating bar is the buttons only.
export default function DecisionBar({ submissionId, status, me, admin, compact = false }: {
  submissionId: string
  status: Status
  me: Actor
  admin: boolean
  compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const choose = async (to: Status) => {
    if (to === status) return
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

  const seg = admin ? (
    <div className="seg decide" role="group" aria-label="Decision">
      {CHOICES.map(({ status: c, label }) => (
        <button key={c} className={`st-${c}`} aria-pressed={status === c} disabled={busy} onClick={() => void choose(c)}>
          <span className="dot" />{label}
        </button>
      ))}
    </div>
  ) : <StatusChip status={status} />
  if (compact) {
    return <span className="mini-control">{seg}{error && <span className="inline-error" role="alert" title={error}>Not saved</span>}</span>
  }

  return (
    <div>
      <div className="control-label">Decision</div>
      {seg}
      <div className="control-note">
        {error ? <span className="inline-error" role="alert">{error}</span> : (
          <>
            {admin && <StatusChip status={status} />}
            <StatusHistory key={submissionId} submissionId={submissionId} />
            {admin && status !== 'pending' && <> · <button className="link-btn" disabled={busy} onClick={() => void choose('pending')}>Reset to pending</button></>}
          </>
        )}
      </div>
    </div>
  )
}
