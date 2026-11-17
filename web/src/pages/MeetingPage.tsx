import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { STATUSES } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import ApprovedSoFar from '../components/ApprovedSoFar.tsx'
import Comments from '../components/Comments.tsx'
import { IconLeft, IconRight, IconScreen } from '../components/Icons.tsx'
import OverviewBox from '../components/OverviewBox.tsx'
import SimilarTalks from '../components/SimilarTalks.tsx'
import SpeakerPanel from '../components/SpeakerPanel.tsx'
import StatusChip, { statusLabel } from '../components/StatusChip.tsx'
import TalkHeader from '../components/TalkHeader.tsx'
import TalkPanel from '../components/TalkPanel.tsx'
import { useData } from '../data/DataProvider.tsx'
import { approvedBalance } from '../lib/balance.ts'
import { cardFor } from '../lib/cards.ts'
import { applyFilter, buildRows, readQuery, sortRows, writeQuery } from '../lib/listView.ts'
import { loadProjector, loadShowAll, saveProjector } from '../lib/prefs.ts'
import { idInOrder, neighbors } from '../lib/sequence.ts'
import { otherTalks } from '../lib/speakers.ts'
import { statusOf } from '../lib/status.ts'

const typing = (t: EventTarget | null) => t instanceof HTMLElement && t.closest('input, textarea, select, [contenteditable]') !== null

export default function MeetingPage() {
  const { id = '' } = useParams()
  const { me } = useAuth()
  const { cards, reviews, scores, comments, loading } = useData()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [showAll] = useState(loadShowAll)
  const [projector, setProjector] = useState(loadProjector)

  useEffect(() => { window.scrollTo(0, 0) }, [id])
  // Projector view is a class on <html> (it hides the sidebar too), set only while a talk is open; the choice is
  // remembered for the next talk.
  useEffect(() => {
    document.documentElement.classList.toggle('projector', projector)
    saveProjector(projector)
    return () => document.documentElement.classList.remove('projector')
  }, [projector])

  const { filter, sort } = readQuery(params)
  const query = params.toString()
  const go = (to: string | null) => { if (to) navigate(`/talk/${to}${query ? `?${query}` : ''}`) }

  // Snapshot of the stepping order: recomputed only when the query changes or data finishes loading,
  // never on live data changes (a talk decided mid-meeting must not reshuffle the sequence).
  const order = useMemo(() => {
    if (loading) return []
    const rows = buildRows(cards, reviews, scores, comments, me?.uid ?? '', showAll)
    return sortRows(applyFilter(rows, { ...filter, status: 'all' }), sort).map((r) => r.sub.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, loading])

  // A link to a document that has merged into another card (or whose group changed primary) opens that card.
  const card = cardFor(cards, id)
  const cardId = card?.id

  const inFilter = (tid: string) => filter.status === 'all' || statusOf(reviews, tid) === filter.status
  const nav = neighbors(order, inFilter, idInOrder(order, id, card?.memberIds ?? []))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat) return
      if (e.key === 'ArrowLeft') go(nav.prev)
      else if (e.key === 'ArrowRight') go(nav.next)
      else if (e.key === 'p' || e.key === 'P') setProjector((p) => !p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const balance = useMemo(() => approvedBalance(cards, reviews), [cards, reviews])

  const backTo = `/${query ? `?${query}` : ''}`
  useEffect(() => {
    // Only on complete data: before reviews/scores/comments load, a group's primary may not be the final one.
    if (!loading && cardId !== undefined && cardId !== id) navigate(`/talk/${cardId}${query ? `?${query}` : ''}`, { replace: true })
  }, [loading, cardId, id, query, navigate])
  const visible = card && (!card.removedFromSheet || filter.showRemoved)

  if (loading) return <p className="muted">Loading…</p>
  if (!card || !visible) {
    return (
      <div className="empty">
        <b>Talk not found</b>It may have been removed from the sheet.{' '}
        <Link to={backTo}>Back to Submissions</Link>
      </div>
    )
  }

  const actor = { uid: me?.uid ?? '', name: me?.name ?? '' }
  const admin = me?.role === 'admin'
  const others = otherTalks(cards, card)

  return (
    <>
      <div className="stepper">
        <Link className="crumb" to={backTo}><IconLeft />Submissions</Link>
        <span className="muted" aria-hidden="true">·</span>
        <span className="select">
          <select aria-label="Step through" value={filter.status}
            onChange={(e) => setParams(writeQuery({ ...filter, status: e.target.value as typeof filter.status }, sort), { replace: true })}>
            <option value="all">All talks</option>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)} only</option>)}
          </select>
        </span>
        <span className="muted num">{nav.position !== null ? `${nav.position} of ${nav.total}` : `Not in the current filters · ${nav.total} in them`}</span>
        <span className="grow" />
        <span className="muted step-hint" style={{ fontSize: 13 }}><span className="kbd">←</span> <span className="kbd">→</span> to step · <span className="kbd">P</span> projector</span>
        <button className="btn sm" id="proj" aria-pressed={projector} onClick={() => setProjector((p) => !p)}>
          <IconScreen />{projector ? 'Exit projector view' : 'Projector view'}
        </button>
        <button className="btn sm" disabled={!nav.prev} onClick={() => go(nav.prev)}><IconLeft />Previous</button>
        <button className="btn sm" disabled={!nav.next} onClick={() => go(nav.next)}>Next<IconRight /></button>
      </div>

      <TalkHeader key={card.id} card={card} status={statusOf(reviews, card.id)} scores={scores.get(card.id) ?? []}
        me={actor} showAll={showAll} admin={admin} titleOf={(tid) => cardFor(cards, tid)?.title} />

      <div className="talk-grid">
        <div className="stack">
          <TalkPanel sub={card} />
          <OverviewBox key={`overview-${card.id}`} card={card} />
          <Comments key={card.id} submissionId={card.id} comments={comments.get(card.id) ?? []} me={actor} />
        </div>
        <div className="stack">
          <SpeakerPanel sub={card} />
          {others.length > 0 && (
            <section className="card pad" aria-label="Also submitted">
              <div className="card-head"><h2>Also submitted by {card.firstName.trim() || 'this speaker'}</h2></div>
              <ul className="mini-list">
                {others.map((o) => (
                  <li key={o.id}>
                    <div className="grow">
                      <Link to={`/talk/${o.id}${query ? `?${query}` : ''}`}>{o.title || 'Untitled'}</Link>
                      <div className="cell-sub">{[o.topicGroup, o.level].filter(Boolean).join(' · ')}</div>
                    </div>
                    <StatusChip status={statusOf(reviews, o.id)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <SimilarTalks key={`similar-${card.id}`} card={card} />
          <ApprovedSoFar balance={balance} />
        </div>
      </div>
    </>
  )
}
