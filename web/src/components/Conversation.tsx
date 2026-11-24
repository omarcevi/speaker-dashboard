import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { EmailDoc, ThreadDoc } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useData } from '../data/DataProvider.tsx'
import { emailAttachment, queueEmails } from '../data/mailActions.ts'
import { useSpeakers } from '../data/useSpeakers.ts'
import { useThreadMessages, type ThreadMessage } from '../data/useThreadMessages.ts'
import { bounceSummary, displayName, formatBytes, linkParts, shortDateTime, stateLabel, stateTone } from '../lib/emails.ts'
import { initials } from '../lib/initials.ts'
import { askedNow, canDraft, currentDraft, isDrafting, prefill, seenOf, sendStep, type Seen } from '../lib/replyAssist.ts'
import { EmailFrame } from './EmailFrame.tsx'
import { IconDownload } from './Icons.tsx'
import { AiLine, DraftButton, GapConfirm, SuggestedReply } from './ReplyAssist.tsx'

type Email = EmailDoc & { id: string }
type Message = ThreadMessage
type Item = { kind: 'ours'; at: number; email: Email } | { kind: 'received'; at: number; msg: Message }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Plain text with http(s) links made clickable. Rendered as React text, never as HTML. */
function Text({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((p, i) =>
        p.href ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">{p.text}</a> : <span key={i}>{p.text}</span>)}
    </>
  )
}

export function StateChip({ email, label }: { email: EmailDoc; label?: string }) {
  const tone = stateTone(email)
  return <span className={tone ? `mstate ${tone}` : 'mstate'}>{label ?? stateLabel(email)}</span>
}

function download(name: string, mimeType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function AttachmentChip({ threadId, messageId, att }: { threadId: string; messageId: string; att: Message['attachments'][number] }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const get = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await emailAttachment({ threadId, messageId, attachmentId: att.id })
      download(r.name || att.name, r.mimeType || att.mimeType, r.base64)
    } catch (e) {
      setError(`Couldn't download ${att.name}: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span>
      <button type="button" className="att att-btn" disabled={busy} onClick={() => void get()} aria-label={`Download ${att.name}`}>
        <IconDownload />{att.name} <span className="muted">{busy ? 'Downloading…' : formatBytes(att.size)}</span>
      </button>
      {error && <span className="inline-error" role="alert" style={{ display: 'block', marginTop: 4 }}>{error}</span>}
    </span>
  )
}

function Quoted({ text }: { text: string }) {
  const [shown, setShown] = useState(false)
  if (!shown) return <button type="button" className="quoted-btn" onClick={() => setShown(true)}>Show quoted text</button>
  return <div className="quoted"><Text text={text} /></div>
}

function Ours({ email }: { email: Email }) {
  const sent = email.state === 'sent'
  const at = (email.sentAt ?? email.sendAt).toMillis()
  const to = [email.to, ...email.cc].join(', ')
  return (
    <article className="msg ours">
      <div className="msg-h">
        <span className="avatar sm" aria-hidden="true">DF</span>
        <div className="grow"><b>DevFest Istanbul ({email.byName})</b><span className="to">to {to}</span></div>
        {sent ? <span className="muted" style={{ fontSize: 12 }}>{shortDateTime(at)}</span> : <StateChip email={email} />}
      </div>
      <div className="msg-b">
        {email.html ? <EmailFrame html={email.html} title={`Email to ${email.to}`} compact />
          : email.text ? <Text text={email.text} /> : <span className="muted">Written when it goes out.</span>}
      </div>
      {email.attachments.length > 0 && (
        <div className="att-row">
          {email.attachments.map((a) => <span key={a.path} className="att">{a.name} <span className="muted">{formatBytes(a.size)}</span></span>)}
        </div>
      )}
    </article>
  )
}

function Received({ threadId, msg, reason }: { threadId: string; msg: Message; reason: string | null }) {
  const when = shortDateTime(msg.at.toMillis())
  if (msg.kind === 'bounce') {
    return (
      <article className="msg bounce">
        <div className="msg-h">
          <span className="avatar sm" aria-hidden="true">!</span>
          <div className="grow"><b>Not delivered</b><span className="to">{displayName(msg.from)} · {when}</span></div>
        </div>
        <div className="msg-b"><Text text={bounceSummary(reason ?? msg.text)} /></div>
        {msg.truncated && <p className="note">Shortened: the full message is in Gmail</p>}
      </article>
    )
  }
  const team = msg.kind === 'team'
  const name = displayName(msg.from)
  return (
    <article className={team ? 'msg ours' : 'msg'}>
      <div className="msg-h">
        <span className="avatar sm" aria-hidden="true">{team ? 'DF' : initials(name)}</span>
        <div className="grow"><b>{team ? `${name} (from Gmail)` : name}</b><span className="to">to {msg.to.join(', ')}</span></div>
        <span className="muted" style={{ fontSize: 12 }}>{when}</span>
      </div>
      <div className="msg-b"><Text text={msg.text} /></div>
      {msg.attachments.length > 0 && (
        <div className="att-row">
          {msg.attachments.map((a) => <AttachmentChip key={a.id} threadId={threadId} messageId={msg.id} att={a} />)}
        </div>
      )}
      {msg.quoted.trim() !== '' && <Quoted text={msg.quoted} />}
      {msg.truncated && <p className="note">Shortened: the full message is in Gmail</p>}
    </article>
  )
}

function ReplyBox({ threadId, speakerKey, firstName, thread }: { threadId: string; speakerKey: string; firstName: string; thread: ThreadDoc | undefined }) {
  const draft = currentDraft(thread)
  const [body, setBody] = useState(draft?.text ?? '')
  const [seen, setSeen] = useState<Seen | null>(draft ? seenOf(draft) : null)
  // The reply the admin pressed Draft a reply / Redraft for; the next new draft for that same reply then replaces the
  // box even if they typed. A newer reply drops the request, so its auto-draft never replaces typed text.
  const [askedFor, setAskedFor] = useState<string | null>(null)
  // Otherwise a newer draft replaces the box only while it is empty or still holds the last draft.
  const next = prefill(body, seen, draft, askedNow(askedFor, thread))
  if (next) {
    setBody(next.body)
    setSeen(next.seen)
    setAskedFor(null)
  }
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gap, setGap] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const send = async (confirmed: boolean) => {
    if (sending) return
    const step = sendStep(body, confirmed)
    if (step.kind === 'empty') return
    if (step.kind === 'confirm') {
      setGap(step.gap)
      return
    }
    setGap(null)
    setSending(true)
    setError(null)
    try {
      const r = await queueEmails({
        batchId: crypto.randomUUID(), templateId: null, custom: { subject: '', body }, speakerKeys: [speakerKey],
        followUp: false, sendAt: null, includeCc: false, replyToThreadId: threadId,
      })
      if (r.queued.length === 0) setError(`Couldn't send: ${r.skipped[0]?.reason ?? 'the reply was not queued'}`)
      else setBody('')
    } catch (e) {
      setError(`Couldn't send: ${errorText(e)}`)
    } finally {
      setSending(false)
    }
  }
  return (
    <form className="reply" onSubmit={(e) => { e.preventDefault(); void send(false) }}>
      <label className="vh" htmlFor={id}>Reply</label>
      <textarea ref={box} id={id} placeholder={firstName ? `Reply to ${firstName}` : 'Reply'} value={body}
        onChange={(e) => { setBody(e.target.value); setGap(null) }} />
      {error && <p className="inline-error" role="alert" style={{ marginTop: 6 }}>{error}</p>}
      {draftError && <p className="inline-error" role="alert" style={{ marginTop: 6 }}>{draftError}</p>}
      {gap && <GapConfirm gap={gap} onSend={() => void send(true)} onKeep={() => { setGap(null); box.current?.focus() }} />}
      <div className="row-end">
        <span className="hint">Sent from the team mailbox in the same Gmail conversation, with the team signature added</span>
        <span className="actions">
          {canDraft(thread) && (
            <DraftButton threadId={threadId} hasDraft={draft !== null} drafting={drafting || isDrafting(thread, Date.now())}
              onBusy={(b) => { setDrafting(b); if (b) setAskedFor(thread?.lastReplyId ?? null) }}
              onError={(e) => { setDraftError(e); if (e) setAskedFor(null) }} />
          )}
          <button className="btn primary sm" type="submit" disabled={sending || body.trim() === ''}>{sending ? 'Sending…' : 'Send reply'}</button>
        </span>
      </div>
    </form>
  )
}

// One conversation, in a side sheet over the page. Used on the Emails page and the talk page.
export default function Conversation({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { me } = useAuth()
  const admin = me?.role === 'admin'
  const { emails, threads } = useData()
  const { byKey } = useSpeakers()
  const { messages, loadError } = useThreadMessages(threadId)
  const [settling, setSettling] = useState(false)
  const [settleError, setSettleError] = useState<string | null>(null)
  const panel = useRef<HTMLElement>(null)
  const headingId = useId()
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })

  // Focus moves into the panel and back to whatever opened it; Escape closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  const ours = useMemo(
    () => emails.filter((e) => e.threadId === threadId || e.replyToThreadId === threadId),
    [emails, threadId],
  )
  const root = useMemo(() => {
    const byTime = (a: Email, b: Email) => a.createdAt.toMillis() - b.createdAt.toMillis()
    return [...ours].filter((e) => e.replyToThreadId === null).sort(byTime)[0] ?? [...ours].sort(byTime)[0]
  }, [ours])
  const items = useMemo(() => {
    const list: Item[] = [
      ...ours.map((email): Item => ({ kind: 'ours', at: (email.sentAt ?? email.sendAt).toMillis(), email })),
      ...(messages ?? []).map((msg): Item => ({ kind: 'received', at: msg.at.toMillis(), msg })),
    ]
    return list.sort((a, b) => a.at - b.at)
  }, [ours, messages])

  const thread = threads.find((t) => t.id === threadId)
  const speakerKey = thread?.speakerKey ?? root?.speakerKey ?? ''
  const g = byKey.get(speakerKey)
  const speakerName = g ? `${g.name.first} ${g.name.last}`.trim() : root?.to ?? ''
  const bounceReason = ours.find((e) => e.bounce !== null)?.bounce?.reason.trim() || null
  // The AI's reading (and, for members, the suggested reply) sits under the newest reply, or above the reply box
  // when that reply isn't loaded.
  const draft = currentDraft(thread)
  const assist = thread && (
    <>
      <AiLine thread={thread} me={admin && me ? me : null} busy={settling} error={settleError} onBusy={setSettling} onError={setSettleError} />
      {!admin && draft && <SuggestedReply text={draft.text} />}
    </>
  )
  const newestShown = !!thread?.lastReplyId && items.some((it) => it.kind === 'received' && it.msg.id === thread.lastReplyId)
  const bounced = ours.some((e) => e.bounce !== null) || (messages ?? []).some((m) => m.kind === 'bounce')

  // Keep Tab inside the dialog.
  const trap = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current) return
    const f = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select')]
    if (f.length === 0) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const title = root ? root.subject || root.templateName || 'Custom email' : 'Conversation'
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} onKeyDown={trap}>
        <header className="sheet-head">
          <div className="grow">
            <h2 id={headingId}>{title}</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {root?.templateId ? root.templateName : 'Custom email'}{speakerName && ` · with ${speakerName}`}
            </p>
          </div>
          {root && <StateChip email={root} />}
          <button className="icon-btn" style={{ marginLeft: 4 }} onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="sheet-body">
          {loadError && <div className="banner" role="alert" style={{ margin: 0 }}>{loadError}</div>}
          {items.map((it) =>
            it.kind === 'ours' ? <Ours key={`e-${it.email.id}`} email={it.email} /> : (
              <Fragment key={`m-${it.msg.id}`}>
                <Received threadId={threadId} msg={it.msg} reason={bounceReason} />
                {it.msg.id === thread?.lastReplyId && assist}
              </Fragment>
            ))}
          {messages === null && !loadError && <p className="muted">Loading replies…</p>}
          {!newestShown && assist}
        </div>
        {admin && !bounced && speakerKey && <ReplyBox threadId={threadId} speakerKey={speakerKey} firstName={g?.name.first ?? ''} thread={thread} />}
      </aside>
    </>
  )
}
