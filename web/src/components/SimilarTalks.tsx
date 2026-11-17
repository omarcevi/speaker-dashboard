import { Link, useLocation } from 'react-router-dom'
import { useData } from '../data/DataProvider.tsx'
import type { Card } from '../lib/cards.ts'
import { barWidth, CLOSE, similarFor, similarState, VERY_SIMILAR } from '../lib/similar.ts'
import { statusOf } from '../lib/status.ts'
import StatusChip from './StatusChip.tsx'

export default function SimilarTalks({ card }: { card: Card }) {
  const { cards, reviews, ai } = useData()
  const { search } = useLocation()
  const state = similarState(ai.get(card.displayId))
  if (state === 'hidden') return null
  const s = state === 'ready' ? similarFor(card, cards, ai, reviews) : null
  return (
    <section className="card pad" aria-label="Similar talks">
      <div className="card-head">
        <h2>Similar talks</h2>
        {s && <span className="muted num" title="Submissions close to this one, and how many of them are approved">{s.closeCount}{s.capped ? '+' : ''} close · {s.approvedClose} approved</span>}
      </div>
      {!s ? <p className="muted">Not ready yet.</p> : (
        <>
          {s.veryAlikeApproved.map((c) => (
            <p key={c.id} className="notice similar-warning" role="status">Already approved and very similar: {c.title}</p>
          ))}
          {s.top.length === 0 ? <p className="muted">No close matches among the other talks.</p> : (
            <ul className="mini-list">
              {s.top.map(({ card: c, score }) => (
                <li key={c.id}>
                  <div className="grow">
                    <Link to={`/talk/${c.id}${search}`}>{c.title}</Link>
                    <div className="cell-sub"><span>{c.firstName} {c.lastName}</span><span title={score.toFixed(2)} style={{ whiteSpace: 'nowrap' }}>· {score >= VERY_SIMILAR ? 'Very similar' : score >= CLOSE ? 'Similar' : 'Loosely related'}</span></div>
                    {barWidth(score) > 0 && <span className="sim" aria-hidden="true"><i style={{ width: `${barWidth(score)}%` }} /></span>}
                  </div>
                  <StatusChip status={statusOf(reviews, c.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
