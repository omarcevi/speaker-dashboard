import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { STATUSES } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import RefreshButton from '../components/RefreshButton.tsx'
import StatusChip, { statusLabel } from '../components/StatusChip.tsx'
import { useData } from '../data/DataProvider.tsx'
import { applyFilter, buildRows, readQuery, sortRows, writeQuery, type ListFilter, type SortKey } from '../lib/listView.ts'
import { statusCounts } from '../lib/status.ts'

const STORAGE_KEY = 'showAllScores'

function loadShowAll(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function saveShowAll(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(v))
  } catch {
    // storage unavailable; the choice just won't persist
  }
}

function distinct(values: string[]): string[] {
  return [...new Set(values.filter((v) => v !== ''))].sort((a, b) => a.localeCompare(b))
}

const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(1))

export default function ListPage() {
  const { me } = useAuth()
  const { submissions, reviews, scores, comments, loading } = useData()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(loadShowAll)

  const { filter, sort } = readQuery(params)
  const query = params.toString()
  const update = (patch: Partial<ListFilter>, nextSort: SortKey = sort) =>
    setParams(writeQuery({ ...filter, ...patch }, nextSort), { replace: true })

  const rows = useMemo(
    () => buildRows(submissions, reviews, scores, comments, me?.uid ?? '', showAll),
    [submissions, reviews, scores, comments, me?.uid, showAll],
  )
  const visible = useMemo(() => sortRows(applyFilter(rows, filter), sort), [rows, filter, sort])
  const counts = useMemo(() => statusCounts(submissions, reviews), [submissions, reviews])

  const live = submissions.filter((s) => !s.removedFromSheet)
  const topics = distinct(live.map((s) => s.topicGroup))
  const levels = distinct(live.map((s) => s.level))
  const languages = distinct(live.map((s) => s.language))

  const select = (label: string, value: string | null, options: string[], key: 'topic' | 'level' | 'language') => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => update({ [key]: e.target.value || null })}>
      <option value="">{label}: all</option>
      {(value && !options.includes(value) ? [value, ...options] : options).map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <div className="list-page">
      <div className="list-head">
        <h1>Submissions</h1>
        <RefreshButton />
      </div>

      <div className="chips">
        {(['all', ...STATUSES] as const).map((s) => (
          <button
            key={s}
            className={`chip chip-btn${filter.status === s ? ' active' : ''}`}
            style={{ background: s === 'all' ? undefined : `var(--st-${s})` }}
            onClick={() => update({ status: s })}
          >
            {s === 'all' ? 'All' : statusLabel(s)} {counts[s]}
          </button>
        ))}
      </div>

      <div className="controls">
        <input
          type="search"
          placeholder="Search title, speaker, company, email"
          value={filter.q}
          onChange={(e) => update({ q: e.target.value })}
        />
        {select('Topic', filter.topic, topics, 'topic')}
        {select('Level', filter.level, levels, 'level')}
        {select('Language', filter.language, languages, 'language')}
        <select aria-label="Sort" value={sort} onChange={(e) => update({}, e.target.value as SortKey)}>
          <option value="date">Sort: submission order</option>
          <option value="score">Sort: average score</option>
          <option value="spread">Sort: score spread</option>
        </select>
        <label>
          <input type="checkbox" checked={filter.showRemoved} onChange={(e) => update({ showRemoved: e.target.checked })} />
          {' '}Show removed rows
        </label>
        <label>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => { setShowAll(e.target.checked); saveShowAll(e.target.checked) }}
          />
          {' '}Show all team scores
        </label>
      </div>

      {loading ? <p>Loading…</p> : visible.length === 0 ? <p className="muted">No submissions match.</p> : (
        <table className="list-table">
          <thead>
            <tr>
              <th>Status</th><th>Title</th><th>Speaker</th><th>Topic</th><th>Level</th><th>Language</th>
              <th>Avg</th><th>Spread</th><th>Comments</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.sub.id}
                className={`row-link${r.sub.removedFromSheet ? ' removed' : ''}`}
                tabIndex={0}
                onClick={() => navigate(`/talk/${r.sub.id}${query ? `?${query}` : ''}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/talk/${r.sub.id}${query ? `?${query}` : ''}`) }}
              >
                <td><StatusChip status={r.status} /></td>
                <td>
                  {r.sub.title}
                  {r.sub.noSession && <span className="tag">No session</span>}
                  {r.sub.removedFromSheet && <span className="tag">Removed</span>}
                </td>
                <td>
                  {r.sub.firstName} {r.sub.lastName}
                  {r.otherTalkCount > 0 && (
                    <span className="muted"> +{r.otherTalkCount} other {r.otherTalkCount === 1 ? 'talk' : 'talks'}</span>
                  )}
                </td>
                <td>{r.sub.topicGroup}</td>
                <td>{r.sub.level}</td>
                <td>{r.sub.language}</td>
                <td>
                  {fmt(r.score.avg)}
                  {!r.score.revealed && r.score.count > 0 && (
                    <span className="muted"> {r.score.count} {r.score.count === 1 ? 'score' : 'scores'}</span>
                  )}
                </td>
                <td>{r.score.revealed && r.score.max !== null && r.score.min !== null ? r.score.max - r.score.min : '—'}</td>
                <td>{r.commentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
