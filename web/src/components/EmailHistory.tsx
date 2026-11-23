import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SpeakerGroup } from '../../../functions/src/email/recipients.ts'
import type { EmailDoc } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useData } from '../data/DataProvider.tsx'
import { cancelEmail, rescheduleEmail, resolveUnknownEmail, retryEmail } from '../data/mailActions.ts'
import { useSpeakers } from '../data/useSpeakers.ts'
import {
  emailTitle, historyByLine, historyChipLabel, istanbulTime, RULE_ORDER, shortDateTime, speakerHistory, toIstanbulMs,
} from '../lib/emails.ts'
import { istanbulDate, recipientRows, type Judge } from '../lib/send.ts'
import Conversation, { StateChip } from './Conversation.tsx'
import { IconMail } from './Icons.tsx'

type Email = EmailDoc & { id: string }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const sentence = (s: string) => s.trim().replace(/[.\s]+$/, '')

/** One callable at a time per row, with its error shown under the row. */
function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (what: string, fn: () => Promise<unknown>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError(`Couldn't ${what}: ${errorText(e)}`)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function Reschedule({ email, onDone }: { email: Email; onDone: () => void }) {
  const [date, setDate] = useState(() => istanbulDate(email.sendAt.toMillis()))
  const [time, setTime] = useState(() => istanbulTime(email.sendAt.toMillis()))
  const [past, setPast] = useState(false)
  const { busy, error, run } = useAction()
  const save = async () => {
    const at = date && time ? toIstanbulMs(date, time) : NaN
    if (!Number.isFinite(at) || at <= Date.now()) { setPast(true); return }
    setPast(false)
    if (await run('change the time', () => rescheduleEmail(email.id, at))) onDone()
  }
  return (
    <>
      <form className="acts" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <input className="input" type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="input" type="time" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} />
        <span className="hint">Istanbul time</span>
        <button className="btn sm primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="btn sm text" type="button" onClick={onDone}>Back</button>
      </form>
      {past && <p className="inline-error" role="alert">That time has passed. Pick a later one.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </>
  )
}

function Row({ email, admin, firstName, onOpen }: { email: Email; admin: boolean; firstName: string; onOpen: (threadId: string) => void }) {
  const [mode, setMode] = useState<'idle' | 'retime' | 'confirm'>('idle')
  const { busy, error, run } = useAction()
  const name = emailTitle(email)
  const reason = email.reason ? sentence(email.reason) : ''

  let extra = null
  if (email.state === 'failed') {
    extra = (
      <>
        <div className="alert notice"><span><b>Not sent:</b> {reason || 'Gmail refused it'}.{admin && ' If the error could have come after Gmail took it, check the Sent folder before retrying.'}</span></div>
        {admin && <div className="acts"><button className="btn sm" disabled={busy} onClick={() => void run('retry', () => retryEmail(email.id))}>Retry</button></div>}
      </>
    )
  } else if (email.state === 'held') {
    extra = (
      <>
        <div className="alert notice"><span><b>Held on {shortDateTime(email.sendAt.toMillis())}:</b> {reason || 'needs a look'}.{admin && ' Fix it, then send.'}</span></div>
        {admin && (
          <div className="acts">
            <Link className="btn sm" to="/emails/event">Event settings</Link>
            <button className="btn sm primary" disabled={busy} onClick={() => void run('send it', () => retryEmail(email.id))}>Send now</button>
            <button className="btn sm text" disabled={busy} onClick={() => void run('cancel it', () => cancelEmail(email.id))}>Cancel</button>
          </div>
        )}
      </>
    )
  } else if (email.state === 'unknown') {
    extra = (
      <>
        <div className="alert notice"><span>The dashboard lost track of this one mid-send. Check the mailbox's Sent folder before doing anything.</span></div>
        {admin && mode !== 'confirm' && (
          <div className="acts">
            <button className="btn sm" disabled={busy} onClick={() => void run('mark it as sent', () => resolveUnknownEmail(email.id, 'sent'))}>It was sent</button>
            <button className="btn sm" disabled={busy} onClick={() => setMode('confirm')}>It wasn't: send again</button>
          </div>
        )}
        {admin && mode === 'confirm' && (
          <div className="acts">
            <span className="hint confirm">If it did go out, {firstName || 'the speaker'} gets it twice.</span>
            <button className="btn sm primary" disabled={busy}
              onClick={() => void run('send it again', () => resolveUnknownEmail(email.id, 'requeue')).then((ok) => { if (ok) setMode('idle') })}>
              Send again
            </button>
            <button className="btn sm text" disabled={busy} onClick={() => setMode('idle')}>Back</button>
          </div>
        )}
      </>
    )
  } else if (email.state === 'scheduled' && admin) {
    extra = mode === 'retime'
      ? <Reschedule email={email} onDone={() => setMode('idle')} />
      : (
        <div className="acts">
          <button className="btn sm" disabled={busy} onClick={() => setMode('retime')}>Change time</button>
          <button className="btn sm text" disabled={busy} onClick={() => void run('cancel it', () => cancelEmail(email.id))}>Cancel</button>
        </div>
      )
  } else if (email.bounce) {
    extra = <div className="sub">{email.bounce.reason}</div>
  }

  return (
    <li>
      {email.threadId
        ? <button type="button" className="title" onClick={() => onOpen(email.threadId!)}>{name}</button>
        : <span className="title">{name}</span>}
      <StateChip email={email} label={historyChipLabel(email)} />
      <div className="sub">{historyByLine(email)}</div>
      {extra}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </li>
  )
}

/** "Email <first name>": every template with whether this speaker can get it, then a custom email. */
function EmailMenu({ g, firstName }: { g: SpeakerGroup; firstName: string }) {
  const { templates } = useData()
  const sp = useSpeakers()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  const judge: Judge = useMemo(() => ({
    status: sp.status,
    historyOf: (k: string) => sp.history.get(k) ?? [],
    speakerKeys: new Set(sp.groups.map((x) => x.speakerKey)),
  }), [sp])
  const items = useMemo(
    () => [...templates]
      .sort((a, b) => RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule) || a.name.localeCompare(b.name))
      .map((t) => ({ t, row: recipientRows(t.rule, t.id, [g], judge)[0] })),
    [templates, g, judge],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const key = encodeURIComponent(g.speakerKey)
  return (
    <div className="menu-wrap" ref={wrap}
      onBlur={(e) => { if (open && !wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false) }}>
      <button ref={button} type="button" className="btn sm" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
        <IconMail />Email {firstName || 'speaker'}
      </button>
      {open && (
        <div className="card email-menu" id={menuId}>
          <ul className="who-list">
            {items.map(({ t, row }) => {
              if (row.tab === 'ready') {
                return <li key={t.id}><Link to={`/emails/templates/${encodeURIComponent(t.id)}/send`}>{t.name}</Link></li>
              }
              if (row.tab === 'follow') {
                return (
                  <li key={t.id}>
                    <Link to={`/emails/send?followUp=1&template=${encodeURIComponent(t.id)}&speaker=${key}`}>{t.name}</Link>
                    <span className="tag">Follow-up</span>
                  </li>
                )
              }
              return (
                <li key={t.id} className="off" aria-disabled="true">
                  <span>{t.name}<span className="hint">{row.reason}</span></span>
                </li>
              )
            })}
            <li className="custom"><Link to={`/emails/send?speaker=${key}&custom=1`}>Custom email…</Link></li>
          </ul>
        </div>
      )}
    </div>
  )
}

// The talk page's Emails card: this speaker's history (newest first), each conversation one click away, and for
// admins the "Email <first name>" menu and the actions a row's state allows.
export default function EmailHistory({ speakerKey, firstName }: { speakerKey: string; firstName: string }) {
  const { me } = useAuth()
  const admin = me?.role === 'admin'
  const { emails } = useData()
  const { byKey } = useSpeakers()
  const [openThread, setOpenThread] = useState<string | null>(null)
  const rows = useMemo(() => speakerHistory(emails, speakerKey), [emails, speakerKey])
  const g = byKey.get(speakerKey)

  return (
    <section className="card pad emails-card" aria-label="Emails">
      <div className="card-head">
        <h2>Emails</h2>
        {admin && g && <EmailMenu g={g} firstName={firstName} />}
      </div>
      {rows.length > 0
        ? <ul className="hist">{rows.map((e) => <Row key={e.id} email={e} admin={admin} firstName={firstName} onOpen={setOpenThread} />)}</ul>
        : <p className="muted">No emails yet.</p>}
      {openThread && <Conversation threadId={openThread} onClose={() => setOpenThread(null)} />}
    </section>
  )
}
