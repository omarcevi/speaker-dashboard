import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Stage } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import Conversation from '../components/Conversation.tsx'
import EmailsTabs from '../components/EmailsTabs.tsx'
import StageCell from '../components/StageCell.tsx'
import StageMenu from '../components/StageMenu.tsx'
import { setStageException } from '../data/actions.ts'
import { markEmailed } from '../data/mailActions.ts'
import { useStageGrid } from '../data/useStageGrid.ts'
import { useSpeakers } from '../data/useSpeakers.ts'
import { markNote, rowFollow, rowMissing, sendLink, sortRows, stageCounts, stageSummary, type StageRow } from '../lib/stages.ts'

type Filter = 'all' | 'missing' | 'follow'

const FILTERS: [Filter, string, (r: StageRow) => boolean][] = [
  ['all', 'All', () => true],
  ['missing', 'Missing', rowMissing],
  ['follow', 'Needs follow-up', rowFollow],
]

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The open cell menu: which speaker and stage, and the cell button it hangs from. */
interface Menu { key: string; stageId: string; anchor: HTMLButtonElement }

export default function StagesPage() {
  const { me } = useAuth()
  const admin = me?.role === 'admin'
  const navigate = useNavigate()
  const { talkOf, eligible } = useSpeakers()
  const { stages, rows, today, templateOf, loading } = useStageGrid()
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [pressed, setPressed] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  // The cell a menu action came from. If the action turns it static (a mark with no conversation, say), the button
  // goes away; focus then moves to the row's speaker link (or the next control) instead of being lost.
  const back = useRef<{ id: string; anchor: HTMLElement } | null>(null)
  useLayoutEffect(() => {
    const b = back.current
    if (!b || b.anchor.isConnected) return
    back.current = null
    if (document.activeElement && document.activeElement !== document.body) return
    const td = document.querySelector<HTMLElement>(`td[data-cell="${CSS.escape(b.id)}"]`)
    const target = td?.querySelector<HTMLElement>('button')
      ?? td?.closest('tr')?.querySelector<HTMLElement>('th a, button')
      ?? document.querySelector<HTMLElement>('.filterbar [aria-pressed="true"]')
    target?.focus()
  })

  const counts = Object.fromEntries(FILTERS.map(([k, , fn]) => [k, rows.filter(fn).length])) as Record<Filter, number>
  const test = FILTERS.find((f) => f[0] === filter)![2]
  const shown = sortRows(rows.filter(test))
  const nMissing = counts.missing
  const nFollow = counts.follow
  const actor = () => ({ uid: me!.uid, name: me!.name })

  // The open menu's row and stage; gone (so no menu) once the row is filtered out or the stage removed.
  const menuRow = menu ? shown.find((r) => r.g.speakerKey === menu.key) : undefined
  const menuStage = menu ? stages.find((s) => s.id === menu.stageId) : undefined

  const exception = async (key: string, s: Stage, which: 'skipped' | 'added', on: boolean) => {
    try {
      await setStageException(key, s.id, which, on, actor())
    } catch (e) {
      setNote(`Couldn't save: ${errorText(e)}`)
    }
  }

  const mark = async (r: StageRow, s: Stage) => {
    const template = templateOf(s)
    if (!template) return
    const first = r.g.name.first || r.g.email
    setNote(null)
    try {
      const { created } = await markEmailed({ templateId: s.templateIds[0], speakerKeys: [r.g.speakerKey], at: Date.now() })
      const e = created > 0 ? null : eligible(template.rule, r.g, template.id)
      setNote(markNote(created, first, s.name, e && !e.ok ? e.reason : null))
    } catch (e) {
      setNote(`Couldn't mark it: ${errorText(e)}`)
    }
  }
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
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={k === filter} onClick={() => { setFilter(k); setMenu(null) }}>
                {label} <span className="n num">{counts[k]}</span>
              </button>
            ))}
          </div>
          {/* Always mounted, so a new note is announced. */}
          <div role="status">
            {note && (
              <div className="note">
                <span>{note}</span>
                <button type="button" className="btn sm text" onClick={() => setNote(null)}>Dismiss</button>
              </div>
            )}
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
                        const template = templateOf(s)
                        const missingKeys = c.missing > 0 ? rows.filter((r) => r.cells[s.id]?.kind === 'missing').map((r) => r.g.speakerKey) : []
                        return (
                          <th key={s.id} className="col" scope="col">
                            <div className="name">{s.name}</div>
                            <div className="sub">
                              {stageSummary(s, c, today)}
                              {s.appliesTo === 'added' && <><br />Only speakers added</>}
                            </div>
                            {!template && <div className="warn-line">Template deleted</div>}
                            {admin && template && missingKeys.length > 0 && (
                              <Link className="btn sm" to={sendLink(s.templateIds[0], missingKeys)}>Send to the {missingKeys.length} missing</Link>
                            )}
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
                            const menuOn = menu?.key === key && menu.stageId === s.id
                            return (
                              <td key={s.id} data-cell={id}>
                                <StageCell cell={cell} admin={admin} expanded={pressed === id || menuOn}
                                  onOpen={threadId ? () => { setPressed(id); setOpen(threadId) } : talk ? () => navigate(`/talk/${talk}`) : null}
                                  onMenu={(anchor) => setMenu(menuOn ? null : { key, stageId: s.id, anchor })} />
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
      {admin && menu && menuRow && menuStage && (
        <StageMenu anchor={menu.anchor} first={menuRow.g.name.first || menuRow.g.email} stage={menuStage}
          kind={menuRow.cells[menuStage.id].kind} hasTemplate={!!templateOf(menuStage)} onClose={closeMenu}
          onSend={() => navigate(sendLink(menuStage.templateIds[0], [menuRow.g.speakerKey]))}
          onMark={() => { back.current = { id: `${menuRow.g.speakerKey}|${menuStage.id}`, anchor: menu.anchor }; void mark(menuRow, menuStage) }}
          onException={(which, on) => {
            back.current = { id: `${menuRow.g.speakerKey}|${menuStage.id}`, anchor: menu.anchor }
            void exception(menuRow.g.speakerKey, menuStage, which, on)
          }} />
      )}
      {open && <Conversation threadId={open} onClose={() => { setOpen(null); setPressed(null) }} />}
    </>
  )
}
