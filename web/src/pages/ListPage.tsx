import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider.tsx'
import { IconSearch } from '../components/Icons.tsx'
import RefreshButton, { SyncProblems } from '../components/RefreshButton.tsx'
import SourceBadge from '../components/SourceBadge.tsx'
import StatusChip from '../components/StatusChip.tsx'
import StatusFilter from '../components/StatusFilter.tsx'
import { useData } from '../data/DataProvider.tsx'
import { applyFilter, buildRows, countByStatus, readQuery, sortRows, writeQuery, type ListFilter, type ListRow, type SortKey } from '../lib/listView.ts'
import { loadShowAll, saveShowAll } from '../lib/prefs.ts'

function distinct(values: string[]): string[] {
  return [...new Set(values.filter((v) => v !== ''))].sort((a, b) => a.localeCompare(b))
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function ScoreCell({ row }: { row: ListRow }) {
  const s = row.score
  if (s.revealed && s.avg !== null) {
    return (
      <>
        <div className="cell-main">{s.avg.toFixed(1)}</div>
        <div className="cell-sub" style={{ justifyContent: 'flex-end' }}>{s.min === s.max ? s.min : `${s.min}–${s.max}`} · {plural(s.count, 'score')}</div>
      </>
    )
  }
  return (
    <>
      <div className="cell-main dash">—</div>
      <div className="cell-sub" style={{ justifyContent: 'flex-end' }} title={s.count ? "Score this talk to see the team's scores" : undefined}>
        {s.count === 0 ? 'No scores yet' : `Hidden · ${plural(s.count, 'score')}`}
      </div>
    </>
  )
}

export default function ListPage() {
  const { me } = useAuth()
  const { cards, reviews, scores, comments, loading } = useData()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(loadShowAll)

  const { filter, sort } = readQuery(params)
  const query = params.toString()
  const update = (patch: Partial<ListFilter>, nextSort: SortKey = sort) =>
    setParams(writeQuery({ ...filter, ...patch }, nextSort), { replace: true })

  const rows = useMemo(
    () => buildRows(cards, reviews, scores, comments, me?.uid ?? '', showAll),
    [cards, reviews, scores, comments, me?.uid, showAll],
  )
  // The count cards follow every filter except status itself.
  const inScope = useMemo(() => applyFilter(rows, { ...filter, status: 'all' }), [rows, filter])
  const counts = useMemo(() => countByStatus(inScope), [inScope])
  const visible = useMemo(() => sortRows(applyFilter(rows, filter), sort), [rows, filter, sort])

  const live = cards.filter((c) => !c.removedFromSheet)
  const speakers = new Set(live.map((c) => c.speakerKey)).size
  const topics = distinct(live.map((s) => s.topicGroup))
  const levels = distinct(live.map((s) => s.level))
  const removedCount = cards.length - live.length
  const open = (id: string) => navigate(`/talk/${id}${query ? `?${query}` : ''}`)

  const select = (label: string, value: string | null, options: string[], key: 'topic' | 'level') => (
    <span className="select">
      <select aria-label={label} value={value ?? ''} onChange={(e) => update({ [key]: e.target.value || null })}>
        <option value="">All {label.toLowerCase()}s</option>
        {(value && !options.includes(value) ? [value, ...options] : options).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </span>
  )

  const filtered = filter.status !== 'all' || filter.q.trim() !== '' || filter.topic !== null || filter.level !== null
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Submissions</h1>
          <p className="lede">DevFest Istanbul 2026 CFP · {plural(live.length, 'talk')} from {plural(speakers, 'speaker')}</p>
        </div>
        <RefreshButton />
      </div>
      <SyncProblems />

      <StatusFilter counts={counts} active={filter.status} onSelect={(status) => update({ status })} label="Filter by status" />

      <div className="filters">
        <label className="search">
          <span className="vh">Search</span><IconSearch />
          <input type="search" placeholder="Search talks, speakers, companies" value={filter.q} onChange={(e) => update({ q: e.target.value })} />
        </label>
        {select('Topic', filter.topic, topics, 'topic')}
        {select('Level', filter.level, levels, 'level')}
        <span className="select">
          <select aria-label="Sort" value={sort} onChange={(e) => update({}, e.target.value as SortKey)}>
            <option value="date">Submission order</option>
            <option value="score">Highest score first</option>
            <option value="spread">Most disagreement first</option>
          </select>
        </span>
        <span className="grow" />
        <label className="switch">
          <input type="checkbox" checked={showAll} onChange={(e) => { setShowAll(e.target.checked); saveShowAll(e.target.checked) }} />
          <span className="track" />Show all team scores
        </label>
      </div>

      <div className="card table-card">
        <table className="resp">
          <thead>
            <tr>
              <th style={{ width: 128 }}>Status</th><th>Talk</th><th style={{ width: 300 }}>Speaker</th>
              <th className="n" style={{ width: 160 }} aria-sort={sort === 'date' ? undefined : 'descending'}>{sort === 'spread' ? 'Spread' : 'Score'}</th>
              <th className="n" style={{ width: 104 }}>Comments</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="empty">Loading…</td></tr>
            ) : cards.length === 0 ? (
              <tr><td colSpan={5} className="empty"><b>No submissions yet</b>Talks appear here after the Form sheet syncs or an Advocu import.</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={5} className="empty">
                <b>No talks match these filters</b>Try another status or clear the search.{' '}
                <button className="link-btn" onClick={() => setParams(writeQuery({ ...filter, status: 'all', q: '', topic: null, level: null }, sort), { replace: true })}>Clear filters</button>
              </td></tr>
            ) : visible.map((r) => {
              const href = `/talk/${r.sub.id}${query ? `?${query}` : ''}`
              const role = [r.sub.jobTitle, r.sub.company].filter(Boolean).join(', ')
              return (
                <tr key={r.sub.id} className={r.sub.removedFromSheet ? 'row removed' : 'row'}
                  onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) open(r.sub.id) }}>
                  <td data-col="status"><StatusChip status={r.status} />{r.sub.removedFromSheet && <> <span className="tag">Removed from sheet</span></>}</td>
                  <td data-col="talk">
                    <div className="cell-main"><Link to={href}>{r.sub.title || 'Untitled'}</Link></div>
                    <div className="cell-sub">
                      <span>{[r.sub.topicGroup, r.sub.level].filter(Boolean).join(' · ')}</span>
                      <SourceBadge sources={r.sub.sources} />
                      {r.sub.noSession && <span className="tag">No session</span>}
                    </div>
                  </td>
                  <td data-col="speaker">
                    <div className="cell-main">{r.sub.firstName} {r.sub.lastName}</div>
                    <div className="cell-sub">
                      {role && <span>{role}</span>}
                      {r.otherTalkCount > 0 && <span className="tag">+{plural(r.otherTalkCount, 'other talk')}</span>}
                    </div>
                  </td>
                  <td className="n" data-col="score"><ScoreCell row={r} /></td>
                  <td className="n" data-col="hide-sm">{r.commentCount > 0 ? r.commentCount : <span className="dash">0</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && (
          <div className="table-foot">
            <span>{filtered ? `${visible.length} of ${live.length + (filter.showRemoved ? removedCount : 0)} talks match the filters` : plural(visible.length, 'talk')}</span>
            <span>
              {removedCount > 0 && !filter.showRemoved && <>{plural(removedCount, 'row')} removed from the sheet {removedCount === 1 ? 'is' : 'are'} hidden · <button className="link-btn" onClick={() => update({ showRemoved: true })}>Show</button></>}
              {removedCount > 0 && filter.showRemoved && <button className="link-btn" onClick={() => update({ showRemoved: false })}>Hide removed rows</button>}
            </span>
          </div>
        )}
      </div>
    </>
  )
}
