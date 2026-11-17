import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Score, Status } from '../../../functions/src/model.ts'
import type { Actor } from '../data/actions.ts'
import type { Card } from '../lib/cards.ts'
import DecisionBar from './DecisionBar.tsx'
import ScoreBar from './ScoreBar.tsx'
import SourceBadge from './SourceBadge.tsx'
import SpeakerPhoto from './SpeakerPhoto.tsx'

// The talk's header card (title, speaker, score, decision) and a compact bar with the same controls that appears once
// the header has scrolled away. The bar sits in a zero-height sticky anchor, so showing it never changes the layout:
// a header that shrank in place made the browser's scroll anchoring pull the page back up (fixed in the mockup
// 2026-11-17).
export default function TalkHeader({ card, status, scores, me, showAll, admin, titleOf }: {
  card: Card
  status: Status
  scores: Score[]
  me: Actor
  showAll: boolean
  admin: boolean
  titleOf: (id: string) => string | undefined
}) {
  const header = useRef<HTMLElement>(null)
  const [scrolledPast, setScrolledPast] = useState(false)
  useEffect(() => {
    const el = header.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setScrolledPast(!e.isIntersecting), { rootMargin: '-128px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const name = `${card.firstName} ${card.lastName}`.trim()
  const role = [card.jobTitle, card.company].filter(Boolean).join(', ')
  const title = card.title || 'Untitled'
  return (
    <>
      <div className="mini-anchor">
        <div className={scrolledPast ? 'card mini show' : 'card mini'} aria-hidden={!scrolledPast} inert={!scrolledPast}>
          <span className="mini-title">{title}</span>
          <ScoreBar submissionId={card.id} scores={scores} me={me} showAll={showAll} compact />
          <DecisionBar submissionId={card.id} status={status} me={me} admin={admin} compact />
        </div>
      </div>
      <div className="object-wrap">
        <section className="card object" ref={header} aria-label="Talk">
          <SpeakerPhoto key={card.photoFileId ?? 'none'} fileId={card.photoFileId} url={card.photoUrl} name={name} />
          <div style={{ minWidth: 0 }}>
            <h1>{title}</h1>
            <p className="meta">
              <span className="who">{name}</span>
              {role && <span>{role}</span>}
              {[card.topicGroup, card.level, card.language].filter(Boolean).map((v) => (
                <span key={v}><span className="sep">·</span> {v}</span>
              ))}
              <SourceBadge sources={card.sources} />
              {card.noSession && <span className="tag">No session</span>}
              {card.removedFromSheet && <span className="tag">Removed from sheet</span>}
              {card.possibleDuplicateOf.length > 0 && (
                <span className="tag">
                  Possible duplicate of&nbsp;
                  {card.possibleDuplicateOf.map((id, i) => <span key={id}>{i > 0 && ', '}<Link to={`/talk/${id}`}>{titleOf(id) ?? id}</Link></span>)}
                </span>
              )}
            </p>
          </div>
          <div className="verdict">
            <ScoreBar key={`score-${card.id}`} submissionId={card.id} scores={scores} me={me} showAll={showAll} />
            <DecisionBar key={`decision-${card.id}`} submissionId={card.id} status={status} me={me} admin={admin} />
          </div>
        </section>
      </div>
    </>
  )
}
