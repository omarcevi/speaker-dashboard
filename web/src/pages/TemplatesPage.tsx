import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { EmailTemplate } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import EmailsTabs from '../components/EmailsTabs.tsx'
import { deleteTemplate, saveTemplate } from '../data/actions.ts'
import { useData } from '../data/DataProvider.tsx'
import { useNow } from '../data/useNow.ts'
import { useSpeakers } from '../data/useSpeakers.ts'
import { ago, emptyEventFillIns, RULE_ORDER, RULES } from '../lib/emails.ts'
import { formatWhen } from '../lib/syncStatus.ts'

type Template = EmailTemplate & { id: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Actions({ t }: { t: Template }) {
  const { me } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await fn()
      setConfirming(false)
    } catch (e) {
      setError(`Couldn't ${label} ${t.name}: ${errorText(e)}`)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const duplicate = () => run('duplicate', () => saveTemplate(null, {
    name: `${t.name} (copy)`, subject: t.subject, body: t.body, html: t.html ?? null, attachments: t.attachments, rule: t.rule,
  }, { uid: me!.uid, name: me!.name }))

  return (
    <>
      {confirming ? (
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
          <span>Delete {t.name}?</span>
          <button className="btn sm" disabled={busy} onClick={() => run('delete', () => deleteTemplate(t.id))}>Delete</button>
          <button className="btn sm text" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </span>
      ) : (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Link className="btn sm primary" to={`/emails/templates/${t.id}/send`}>Send…</Link>
          <button className="btn sm text" disabled={busy} onClick={() => void duplicate()}>Duplicate</button>
          <button className="btn sm text" disabled={busy} onClick={() => setConfirming(true)}>Delete</button>
        </span>
      )}
      {error && <span className="inline-error" role="alert" style={{ display: 'block', marginTop: 4, textAlign: 'right' }}>{error}</span>}
    </>
  )
}

export default function TemplatesPage() {
  const { me } = useAuth()
  const admin = me?.role === 'admin'
  const { templates, emails, event, mailMeta, loading } = useData()
  const { groups, eligible } = useSpeakers()
  const navigate = useNavigate()
  const now = useNow()

  const list = useMemo(
    () => [...templates].sort((a, b) => RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule) || a.name.localeCompare(b.name)),
    [templates],
  )
  const ready = useMemo(
    () => new Map(list.map((t) => [t.id, groups.filter((g) => eligible(t.rule, g, t.id).ok).length])),
    [list, groups, eligible],
  )
  const fields = event?.fields ?? []
  const sentFromDashboard = emails.filter((e) => e.state === 'sent' && !e.manual).length
  const cols = admin ? 6 : 5

  return (
    <>
      <EmailsTabs />
      <div className="title-row">
        <div><h1>Templates</h1><p className="lede">{plural(templates.length, 'template')} · emails go from the team mailbox</p></div>
        <div className="actions">
          <Link className="btn text" to="/emails/event">Event settings</Link>
          {admin && <Link className="btn" to="/emails/send?custom=1">Custom email</Link>}
          {admin && <Link className="btn primary" to="/emails/templates/new">New template</Link>}
        </div>
      </div>
      <div className="card table-card scroll-x" style={{ marginTop: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Template</th><th style={{ width: 170 }}>Who gets it</th><th className="n" style={{ width: 80 }}>Sent</th>
              <th className="n" style={{ width: 100 }}>Ready now</th><th style={{ width: 170 }}>Last edited</th>
              {admin && <th style={{ width: 250 }}><span className="vh">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={cols} className="empty">Loading…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={cols} className="empty"><b>No templates yet</b>{admin ? 'Start one with New template.' : 'An admin can add one.'}</td></tr>
            ) : list.map((t) => {
              const mine = emails.filter((e) => e.templateId === t.id)
              const sent = mine.filter((e) => e.state === 'sent').length
              const scheduled = mine.filter((e) => e.state === 'scheduled').length
              const empty = emptyEventFillIns(t, fields)
              const href = `/emails/templates/${t.id}`
              const updated = t.updatedAt?.toMillis()
              return (
                <tr key={t.id} className="row" onClick={(ev) => { if (!(ev.target as HTMLElement).closest('a, button')) navigate(href) }}>
                  <td>
                    <div className="cell-main"><Link to={href}>{t.name}</Link></div>
                    <div className="cell-sub">
                      {t.subject.replace(/\{\{\s*[^{}\s]+\s*\}\}/g, '…')}
                      {t.attachments.length > 0 && ` · ${plural(t.attachments.length, 'attachment')}`}
                    </div>
                    {empty.length > 0 && (
                      <div className="cell-sub">
                        <span className="warn-line">
                          <span>Event setting{empty.length > 1 && 's'} {empty.map((n, i) => <span key={n}>{i > 0 && ', '}<b>{n}</b></span>)} {empty.length > 1 ? 'are' : 'is'} empty</span>
                        </span>
                      </div>
                    )}
                  </td>
                  <td>{RULES[t.rule].label}</td>
                  <td className="n num">
                    {sent}
                    {scheduled > 0 && <div className="cell-sub" style={{ justifyContent: 'flex-end' }}>{scheduled} scheduled</div>}
                  </td>
                  <td className="n num">{ready.get(t.id) ?? 0}</td>
                  <td>
                    <div>{updated ? formatWhen(updated) : 'just now'}</div>
                    <div className="cell-sub">{t.updatedByName}</div>
                  </td>
                  {admin && <td><Actions t={t} /></td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="table-foot">
          <span>{mailMeta?.lastPollAt ? `Mailbox checked for replies ${ago(mailMeta.lastPollAt.toMillis(), now)}` : 'Mailbox not checked yet'}</span>
          <span>{plural(sentFromDashboard, 'email')} sent from the dashboard</span>
        </div>
      </div>
    </>
  )
}
