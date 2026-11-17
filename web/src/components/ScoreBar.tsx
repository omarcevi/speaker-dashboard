import { useState } from 'react'
import { setScore, type Actor } from '../data/actions.ts'
import { summarizeScores } from '../lib/scores.ts'
import type { Score } from '../../../functions/src/model.ts'

const VALUES = [1, 2, 3, 4, 5] as const

// Your 1–5 score as a segmented control. The full version adds the team result and who gave what (spec: after you
// score you see each person's name with their score); the compact one in the floating bar is the buttons only.
// Pressing your current score again does nothing, so a double click can't undo it; "Clear" removes it.
export default function ScoreBar({ submissionId, scores, me, showAll, compact = false }: {
  submissionId: string
  scores: Score[]
  me: Actor
  showAll: boolean
  compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const s = summarizeScores(scores, me.uid, showAll)

  const save = async (value: 1 | 2 | 3 | 4 | 5 | null) => {
    setBusy(true)
    setError(null)
    try {
      await setScore(submissionId, value, me)
    } catch (e) {
      setError(`Couldn't save your score: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const seg = (
    <div className="seg score" role="group" aria-label="Your score">
      {VALUES.map((v) => (
        <button key={v} aria-pressed={s.mine === v} disabled={busy} onClick={() => { if (s.mine !== v) void save(v) }}>{v}</button>
      ))}
    </div>
  )
  if (compact) {
    return <span className="mini-control">{seg}{error && <span className="inline-error" role="alert" title={error}>Not saved</span>}</span>
  }

  return (
    <div>
      <div className="control-label">Your score</div>
      {seg}
      <div className="control-note">
        {error ? <span className="inline-error" role="alert">{error}</span>
          : s.revealed && s.avg !== null ? (
            <>
              <span>Team <b className="num" style={{ color: 'var(--text)', fontWeight: 600 }}>{s.avg.toFixed(1)}</b> · {s.min === s.max ? s.min : `${s.min}–${s.max}`} · {s.count} {s.count === 1 ? 'score' : 'scores'}</span>
              {s.mine !== null && <> · <button className="link-btn" disabled={busy} onClick={() => void save(null)}>Clear</button></>}
            </>
          )
          : s.count > 0 ? `${s.count} ${s.count === 1 ? 'score' : 'scores'} so far · score to see them`
          : 'Nobody has scored yet'}
      </div>
      {s.revealed && s.entries.length > 0 && (
        <details className="history-list">
          <summary>Who scored</summary>
          <ul>{s.entries.map((e, i) => <li key={i}>{e.name} <b className="num" style={{ fontWeight: 600, color: 'var(--text)' }}>{e.value}</b></li>)}</ul>
        </details>
      )}
    </div>
  )
}
