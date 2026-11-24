import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider.tsx'
import Conversation from '../components/Conversation.tsx'
import EmailsTabs from '../components/EmailsTabs.tsx'
import StageCell from '../components/StageCell.tsx'
import { useStageGrid } from '../data/useStageGrid.ts'
import { useSpeakers } from '../data/useSpeakers.ts'
import { rowFollow, rowMissing, sortRows, stageCounts, stageSummary, type StageRow } from '../lib/stages.ts'

type Filter = 'all' | 'missing' | 'follow'

const FILTERS: [Filter, string, (r: StageRow) => boolean][] = [
  ['all', 'All', () => true],
  ['missing', 'Missing', rowMissing],
  ['follow', 'Needs follow-up', rowFollow],
]

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function StagesPage() {
  const { me } = useAuth()
  const admin = me?.role === 'admin'
  const navigate = useNavigate()
  const { talkOf } = useSpeakers()
  const { stages, rows, today, templateOf, loading } = useStageGrid()
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [pressed, setPressed] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)

  const test = FILTERS.find((f) => f[0] === filter)![2]
  const shown = sortRows(rows.filter(test))
  const nMissing = rows.filter(rowMissing).length
  const nFollow = rows.filter(rowFollow).length
  const manage = admin && <Link className="btn" to="/emails/stages/manage">Manage stages</Link>

  return (
    <>
      <EmailsTabs />
      <div className="title-row">
        <div><h1>Stages</h1><p className="lede">The emails each approved speaker should get, and who is missing one.</p></div>
        {manage && <div className="actions">{manage}</div>}
      </div>
      {loading ? (
        <div className="card table-card"><div className="empty">Loading…</div></div>
      ) : stages.length === 0 ? (
        <div className="card table-card">
          <div className="empty">
            <b>No stages yet</b>
            {admin ? <>Stages are the emails every approved speaker should get. {manage}</> : 'An admin sets them up.'}
          </div>
        </div>
      ) : (
        <>
          <div className="filterbar" role="group" aria-label="Show">
            {FILTERS.map(([k, label, fn]) => (
              <button key={k} type="button" aria-pressed={k === filter} onClick={() => setFilter(k)}>
                {label} <span className="n num">{rows.filter(fn).length}</span>
              </button>
            ))}
          </div>
          <div className="card table-card scroll-x grid-card">
            {shown.length === 0 ? (
              <div className="empty">
                <b>{filter === 'missing' ? 'Nobody is missing an email' : filter === 'follow' ? 'Nobody needs a follow-up' : 'No speakers yet'}</b>
                {filter === 'follow' && 'Bounces and replies waiting for an answer show up here.'}
              </div>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th className="who" scope="col">Speaker</th>
                      {stages.map((s) => {
                        const c = stageCounts(rows, s.id)
                        return (
                          <th key={s.id} className="col" scope="col">
                            <div className="name">{s.name}</div>
                            <div className="sub">
                              {stageSummary(s, c, today)}
                              {s.appliesTo === 'added' && <><br />Only speakers added</>}
                            </div>
                            {!templateOf(s) && <div className="warn-line">Template deleted</div>}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const key = r.g.speakerKey
                      const talk = talkOf(key)
                      const name = `${r.g.name.first} ${r.g.name.last}`.trim()
                      return (
                        <tr key={key}>
                          <th className="who" scope="row">
                            <div className="cell-main">{talk ? <Link to={`/talk/${talk}`}>{name}</Link> : name}</div>
                            {r.g.cards[0]?.company && <div className="cell-sub">{r.g.cards[0].company}</div>}
                            {r.noApproved && <div className="mark"><b>No approved talk now</b></div>}
                          </th>
                          {stages.map((s) => {
                            const cell = r.cells[s.id]
                            const id = `${key}|${s.id}`
                            const threadId = cell.email?.threadId ?? null
                            return (
                              <td key={s.id}>
                                <StageCell cell={cell} admin={admin} expanded={pressed === id || menu === id}
                                  onOpen={() => {
                                    if (threadId) { setPressed(id); setOpen(threadId) } else if (talk) navigate(`/talk/${talk}`)
                                  }}
                                  onMenu={() => setMenu(menu === id ? null : id)} />
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="table-foot">
                  <span>Click a sent cell to read the conversation. Click a Missing cell to act on it.</span>
                  <span>{plural(shown.length, 'speaker')}</span>
                </div>
              </>
            )}
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            {plural(nMissing, 'speaker')} missing an email · {nFollow} {nFollow === 1 ? 'needs' : 'need'} a follow-up. Speakers shown: everyone with an approved talk, plus anyone who got an acceptance and has no approved talk now.
          </p>
        </>
      )}
      {open && <Conversation threadId={open} onClose={() => { setOpen(null); setPressed(null) }} />}
    </>
  )
}
