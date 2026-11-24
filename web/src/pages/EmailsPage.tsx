import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EmailDoc, ThreadDoc } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import Conversation, { StateChip } from '../components/Conversation.tsx'
import EmailsTabs from '../components/EmailsTabs.tsx'
import { useData } from '../data/DataProvider.tsx'
import { useNow } from '../data/useNow.ts'
import { useSpeakers } from '../data/useSpeakers.ts'
import { clearedByAi } from '../../../functions/src/shared/replyAi.ts'
import { ago, isListed, lastActivity, latestLine, needsLook, shortDateTime, showsWithdrawWarning } from '../lib/emails.ts'

type Email = EmailDoc & { id: string }
type Filter = 'look' | 'ai' | 'all' | 'replied' | 'bounced' | 'scheduled'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const FILTERS: [Filter, string, (e: Email, t: ThreadDoc | undefined) => boolean][] = [
  ['look', 'Needs a look', needsLook],
  ['ai', 'Cleared by AI', (_e, t) => clearedByAi(t)],
  ['all', 'All', () => true],
  ['replied', 'Replied', (e) => e.replyCount > 0],
  ['bounced', 'Bounced', (e) => e.bounce !== null],
  ['scheduled', 'Scheduled', (e) => e.state === 'scheduled' || e.state === 'held'],
]

export default function EmailsPage() {
  const { me } = useAuth()
  const admin = me?.role === 'admin'
  const { emails, threads, mailMeta, loading } = useData()
  const { byKey, talkOf } = useSpeakers()
  const [filter, setFilter] = useState<Filter>('look')
  const [open, setOpen] = useState<string | null>(null)
  const now = useNow()

  const threadOf = useMemo(() => {
    const map = new Map(threads.map((t) => [t.id, t]))
    return (e: EmailDoc) => (e.threadId ? map.get(e.threadId) : undefined)
  }, [threads])
  const listed = useMemo(
    () => emails.filter(isListed).sort((a, b) => lastActivity(b, threadOf(b)) - lastActivity(a, threadOf(a))),
    [emails, threadOf],
  )
  const test = FILTERS.find((f) => f[0] === filter)![2]
  const rows = listed.filter((e) => test(e, threadOf(e)))
  const sent = emails.filter((e) => e.state === 'sent' && !e.manual).length
  const polled = mailMeta?.lastPollAt ? `mailbox checked for replies ${ago(mailMeta.lastPollAt.toMillis(), now)}` : 'mailbox not checked yet'

  return (
    <>
      <EmailsTabs />
      <div className="title-row">
        <div><h1>Emails</h1><p className="lede">{plural(sent, 'email')} sent from the dashboard · {polled}</p></div>
        {admin && (
          <div className="actions">
            <Link className="btn" to="/emails/send?custom=1">Custom email</Link>
            <Link className="btn primary" to="/emails/templates">Send from a template</Link>
          </div>
        )}
      </div>
      <div className="filterbar" role="group" aria-label="Show">
        {FILTERS.map(([k, label, fn]) => (
          <button key={k} type="button" aria-pressed={k === filter} onClick={() => setFilter(k)}>
            {label} <span className="n num">{listed.filter((e) => fn(e, threadOf(e))).length}</span>
          </button>
        ))}
      </div>
      <div className="card table-card scroll-x">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <b>{filter === 'look' ? 'Nothing needs a look' : 'No emails here'}</b>
            {filter === 'look' && 'New replies, bounces and held emails show up here.'}
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr><th style={{ width: 220 }}>Speaker</th><th>Email and latest</th><th style={{ width: 170 }}>State</th><th style={{ width: 170 }}>Sent</th></tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const g = byKey.get(e.speakerKey)
                  const thread = threadOf(e)
                  const talk = talkOf(e.speakerKey)
                  const name = g ? `${g.name.first} ${g.name.last}`.trim() : e.to
                  const company = g?.cards[0]?.company ?? ''
                  const line = latestLine(e, thread, g?.name.first ?? 'The speaker')
                  const cut = line.indexOf(' · ')
                  const strong = needsLook(e, thread)
                  const can = e.threadId !== null
                  const openRow = () => { if (can) setOpen(e.threadId) }
                  const planned = e.state === 'scheduled' || e.state === 'held'
                  return (
                    <tr key={e.id} className={can ? 'row' : undefined} tabIndex={can ? 0 : undefined}
                      onClick={(ev) => { if (!(ev.target as HTMLElement).closest('a, button')) openRow() }}
                      onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openRow() } }}>
                      <td>
                        <div className="cell-main">{talk ? <Link to={`/talk/${talk}`}>{name}</Link> : name}</div>
                        {company && <div className="cell-sub">{company}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{e.templateId ? e.templateName : e.subject || 'Custom email'}</div>
                        <div className="snippet">
                          {strong ? <><b>{cut < 0 ? line : line.slice(0, cut)}</b>{cut < 0 ? '' : line.slice(cut)}</> : line}
                        </div>
                      </td>
                      <td><StateChip email={e} />{showsWithdrawWarning(thread) && <> <span className="mstate warn">May be withdrawing</span></>}</td>
                      <td>
                        <div>{planned ? '—' : shortDateTime((e.sentAt ?? e.createdAt).toMillis())}</div>
                        <div className="cell-sub">{e.byName}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="table-foot">
              <span>Click a row to read the conversation. Replies also show on each speaker's talk page.</span>
              <span>{plural(rows.length, 'email')}</span>
            </div>
          </>
        )}
      </div>
      {open && <Conversation threadId={open} onClose={() => setOpen(null)} />}
    </>
  )
}
