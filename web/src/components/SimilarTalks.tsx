import { Link, useLocation } from 'react-router-dom'
import { useData } from '../data/DataProvider.tsx'
import type { Card } from '../lib/cards.ts'
import { similarFor } from '../lib/similar.ts'
import { statusOf } from '../lib/status.ts'
import StatusChip from './StatusChip.tsx'

export default function SimilarTalks({ card }: { card: Card }) {
  const { cards, reviews, ai } = useData()
  const { search } = useLocation()
  if (!ai.has(card.displayId)) return null
  const s = similarFor(card, cards, ai, reviews)
  return (
    <section className="similar">
      <div className="lbl">
        Similar talks · {s.closeCount}{s.capped ? '+' : ''} submissions close to this one · {s.approvedClose} already approved
      </div>
      {s.veryAlikeApproved.map((c) => (
        <p key={c.id} className="warning" role="status">Already approved and very similar: {c.title}</p>
      ))}
      {s.top.map(({ card: c, score }) => (
        <div key={c.id} className="similar-row">
          <StatusChip status={statusOf(reviews, c.id)} />
          <span className="similar-bar" title={score.toFixed(2)}><span style={{ width: `${Math.round(score * 100)}%` }} /></span>
          <Link to={`/talk/${c.id}${search}`}>{c.title}</Link>
        </div>
      ))}
    </section>
  )
}
