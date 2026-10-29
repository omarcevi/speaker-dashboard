import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider.tsx'
import BalanceRow from '../components/BalanceRow.tsx'
import DecisionBar from '../components/DecisionBar.tsx'
import ScoreBar from '../components/ScoreBar.tsx'
import SpeakerPanel from '../components/SpeakerPanel.tsx'
import { statusLabel } from '../components/StatusChip.tsx'
import StatusCounts from '../components/StatusCounts.tsx'
import TalkPanel from '../components/TalkPanel.tsx'
import { useData } from '../data/DataProvider.tsx'
import { approvedBalance } from '../lib/balance.ts'
import { applyFilter, buildRows, readQuery, sortRows, writeQuery } from '../lib/listView.ts'
import { neighbors } from '../lib/sequence.ts'
import { otherTalks } from '../lib/speakers.ts'
import { statusCounts, statusOf } from '../lib/status.ts'

function loadShowAll(): boolean {
  try {
    return localStorage.getItem('showAllScores') === 'true'
  } catch {
    return false
  }
}

export default function MeetingPage() {
  const { id = '' } = useParams()
  const { me } = useAuth()
  const { submissions, reviews, scores, comments, loading } = useData()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [showAll] = useState(loadShowAll)

  const { filter, sort } = readQuery(params)
  const query = params.toString()
  const go = (to: string | null) => { if (to) navigate(`/talk/${to}${query ? `?${query}` : ''}`) }

  // Snapshot of the stepping order: recomputed only when the query changes or data finishes loading,
  // never on live data changes (a talk decided mid-meeting must not reshuffle the sequence).
  const order = useMemo(() => {
    if (loading) return []
    const rows = buildRows(submissions, reviews, scores, comments, me?.uid ?? '', showAll)
    return sortRows(applyFilter(rows, { ...filter, status: 'all' }), sort).map((r) => r.sub.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, loading])

  const inFilter = (tid: string) => filter.status === 'all' || statusOf(reviews, tid) === filter.status
  const nav = neighbors(order, inFilter, id)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select, [contenteditable]'))) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key === 'ArrowLeft') go(nav.prev)
      else if (e.key === 'ArrowRight') go(nav.next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const counts = useMemo(() => statusCounts(submissions, reviews), [submissions, reviews])
  const balance = useMemo(() => approvedBalance(submissions, reviews), [submissions, reviews])

  const backTo = `/${query ? `?${query}` : ''}`
  const sub = submissions.find((s) => s.id === id)
  const visible = sub && (!sub.removedFromSheet || filter.showRemoved)

  if (loading) return <div className="meeting"><p>Loading…</p></div>
  if (!sub || !visible) {
    return (
      <div className="meeting">
        <p><Link to={backTo}>← List</Link></p>
        <p>Talk not found</p>
      </div>
    )
  }

  const actor = { uid: me?.uid ?? '', name: me?.name ?? '' }
  const word = filter.status === 'all' ? '' : ` ${statusLabel(filter.status).toLowerCase()}`
  const label = `${nav.position ?? '—'} of ${nav.total}${word}`

  return (
    <div className="meeting">
      <div className="meeting-bar">
        <Link to={backTo}>← List</Link>
        <StatusCounts
          counts={counts}
          active={filter.status}
          onSelect={(status) => setParams(writeQuery({ ...filter, status }, sort), { replace: true })}
        />
        <span className="spacer" />
        <button disabled={!nav.prev} onClick={() => go(nav.prev)}>← Prev</button>
        <span>{label}</span>
        <button disabled={!nav.next} onClick={() => go(nav.next)}>Next →</button>
      </div>
      <BalanceRow balance={balance} />
      <div className="meeting-cols">
        <TalkPanel sub={sub} status={statusOf(reviews, sub.id)} comments={comments.get(sub.id) ?? []} me={actor} />
        <SpeakerPanel sub={sub} others={otherTalks(submissions, sub)} reviews={reviews} query={query} />
      </div>
      <div className="meeting-bottom">
        <ScoreBar submissionId={sub.id} scores={scores.get(sub.id) ?? []} me={actor} showAll={showAll} />
        {me?.role === 'admin' && <DecisionBar submissionId={sub.id} status={statusOf(reviews, sub.id)} me={actor} />}
      </div>
    </div>
  )
}
