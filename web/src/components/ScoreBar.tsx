import { useState } from 'react'
import { setScore, type Actor } from '../data/actions.ts'
import { summarizeScores } from '../lib/scores.ts'
import type { Score } from '../../../functions/src/model.ts'

const VALUES = [1, 2, 3, 4, 5] as const

export default function ScoreBar({ submissionId, scores, me, showAll }: {
  submissionId: string
  scores: Score[]
  me: Actor
  showAll: boolean
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

  return (
    <div className="score-bar">
      <span className="lbl">Your score</span>
      {VALUES.map((v) => (
        <button key={v} className={s.mine === v ? 'score-btn selected' : 'score-btn'} aria-pressed={s.mine === v}
          disabled={busy} onClick={() => save(v)}>{v}</button>
      ))}
      {s.mine !== null && (
        <button className="link-btn" disabled={busy} onClick={() => save(null)}>clear</button>
      )}
      <span className="score-summary">
        {s.revealed && s.avg !== null
          ? `Team: ${s.avg} avg from ${s.count} ${s.count === 1 ? 'score' : 'scores'} (${s.min}–${s.max})`
          : `${s.count} ${s.count === 1 ? 'score' : 'scores'} · score to reveal`}
      </span>
      {s.revealed && s.entries.length > 0 && (
        <details className="score-who">
          <summary>who</summary>
          <ul>
            {s.entries.map((e, i) => <li key={i}>{e.name} {e.value}</li>)}
          </ul>
        </details>
      )}
      {error && <span className="inline-error" role="alert">{error}</span>}
    </div>
  )
}
