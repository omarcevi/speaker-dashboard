import { useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import type { SpeakerGroup } from '../../../functions/src/email/recipients.ts'
import type { EmailTemplate, RecipientRule, TemplateAttachment } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { StateChip } from '../components/Conversation.tsx'
import { IconLeft, IconRight } from '../components/Icons.tsx'
import Marked from '../components/Marked.tsx'
import StatusChip from '../components/StatusChip.tsx'
import { useData } from '../data/DataProvider.tsx'
import { markEmailed, queueEmails, sendTestEmail, type QueueEmailsResult } from '../data/mailActions.ts'
import { useNow } from '../data/useNow.ts'
import { useSpeakers } from '../data/useSpeakers.ts'
import { formatBytes, lastDecisionEmail, RULES, shortDate, toIstanbulMs } from '../lib/emails.ts'
import {
  blockedReason, canSend, isDecisionRule, istanbulDate, nameList, passes, plural, prepare, recipientRows, speakerName, untickedExcept, visibleSelection,
  type DecisionFilter, type Judge, type Prepared, type RecipientRow, type Tab,
} from '../lib/send.ts'

type Template = EmailTemplate & { id: string }
type Mode = 'batch' | 'custom' | 'followUp'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const DECISIONS: [DecisionFilter, string][] = [['all', 'All'], ['approved', 'Approved'], ['declined', 'Declined'], ['not-ready', 'Not ready']]
const CUSTOM_BODY = 'Hi {{firstName}},\n\n'
const DAY = 24 * 3600_000
/** Read in event handlers only. */
const clock = () => Date.now()

function Steps({ names, step, offset }: { names: string[]; step: number; offset: number }) {
  return (
    <ol className="steps">
      {names.map((n, i) => {
        const k = i + offset
        return (
          <li key={n} aria-current={step === k ? 'step' : undefined} className={step > k ? 'done' : undefined}>
            <b>{step > k ? '✓' : i + 1}</b>{n}
          </li>
        )
      })}
    </ol>
  )
}

function MailView({ p, source, cc, attachments }: {
  p: Prepared; source: { subject: string; body: string }; cc: boolean; attachments: TemplateAttachment[]
}) {
  return (
    <div className="mail">
      <dl className="mail-h">
        <dt>To</dt><dd>{`${speakerName(p.g)} <${p.g.email}>`}</dd>
        {cc && p.cc.length > 0 && <><dt>Cc</dt><dd>{p.cc.join(', ')}</dd></>}
        <dt>Subject</dt>
        <dd className="subj">{source.subject ? <Marked text={source.subject} values={p.values} /> : <span className="muted">No subject</span>}</dd>
      </dl>
      <div className="mail-b">{source.body ? <Marked text={source.body} values={p.values} /> : <span className="muted">No message yet.</span>}</div>
      {attachments.length > 0 && (
        <div className="mail-att">
          {attachments.map((a) => <span key={a.path} className="att">{a.name} <span className="muted">{formatBytes(a.size)}</span></span>)}
        </div>
      )}
    </div>
  )
}

/** Notes under a preview: why it can't send, and co-speaker cases to handle by hand. */
function PreviewNotes({ p }: { p: Prepared }) {
  return (
    <>
      {!canSend(p) && <p className="warn-line" style={{ marginTop: 12 }}><span>Won't send to {p.g.name.first || speakerName(p.g)}: {blockedReason(p)}</span></p>}
      {p.flags.map((f) => <p key={f} className="warn-line" style={{ marginTop: 12 }}><span>{f}</span></p>)}
    </>
  )
}

/** "Send test to me" for the speaker shown, with the server's refusal inline. */
function useTest(send: (speakerKey: string) => Promise<unknown>) {
  const [state, setState] = useState<Record<string, 'sending' | 'sent' | { error: string }>>({})
  const run = async (key: string) => {
    setState((s) => ({ ...s, [key]: 'sending' }))
    try {
      await send(key)
      setState((s) => ({ ...s, [key]: 'sent' }))
    } catch (e) {
      setState((s) => ({ ...s, [key]: { error: errorText(e) } }))
    }
  }
  const button = (speakerKey: string) => {
    const s = state[speakerKey]
    return (
      <button className="btn sm" disabled={s === 'sending'} onClick={() => void run(speakerKey)}>
        {s === 'sending' ? 'Sending test…' : s === 'sent' ? 'Test sent to you ✓' : 'Send test to me'}
      </button>
    )
  }
  const error = (speakerKey: string) => {
    const s = state[speakerKey]
    return typeof s === 'object' ? <p className="inline-error" role="alert" style={{ marginBottom: 12 }}>Test not sent: {s.error}</p> : null
  }
  const reset = () => setState({})
  return { button, error, reset }
}

function Flow({ mode, template, speakerKey, only }: { mode: Mode; template: Template | null; speakerKey: string | null; only: string | null }) {
  const { emails, event } = useData()
  const sp = useSpeakers()
  const fields = useMemo(() => event?.fields ?? [], [event])
  const now = useNow()
  const judge: Judge = useMemo(() => ({
    status: sp.status,
    historyOf: (k: string) => sp.history.get(k) ?? [],
    speakerKeys: new Set(sp.groups.map((g) => g.speakerKey)),
  }), [sp])

  const [batchId] = useState(() => crypto.randomUUID())
  const [step, setStep] = useState(mode === 'batch' ? 1 : 2)
  const [tab, setTab] = useState<Tab>('ready')
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all')
  const [hideAlready, setHideAlready] = useState(false)
  // Picked from a speaker's Email menu (?speaker= on a batch): only that speaker starts ticked; the rest stay listed.
  const [unticked, setUnticked] = useState<Set<string>>(() =>
    untickedExcept(sp.groups.map((g) => g.speakerKey), mode === 'batch' ? only : null))
  const [picked, setPicked] = useState<string[]>(speakerKey ? [speakerKey] : [])
  const [at, setAt] = useState(0)
  const [includeCc, setIncludeCc] = useState(true)
  const [draft, setDraft] = useState({ subject: '', body: CUSTOM_BODY })
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [date, setDate] = useState(() => istanbulDate(Date.now() + DAY))
  const [time, setTime] = useState('09:00')
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [result, setResult] = useState<(QueueEmailsResult & { keys: string[]; sendAt: number | null }) | null>(null)
  const [marking, setMarking] = useState<'idle' | 'confirm' | 'busy'>('idle')
  const [markNote, setMarkNote] = useState<string | null>(null)

  const followUp = mode === 'followUp'
  const custom = mode === 'custom'
  const rule: RecipientRule = template?.rule ?? 'anyone'
  const templateId = template?.id ?? null
  const source = custom ? draft : { subject: template!.subject, body: template!.body }
  const attachments = template?.attachments ?? []
  const decisionTmpl = isDecisionRule(rule)
  const test = useTest((key) => sendTestEmail({ templateId, custom: custom ? draft : null, speakerKey: key, followUp }))

  // Step 1: every speaker sorted into tabs.
  const rows = useMemo(() => (mode === 'batch' ? recipientRows(rule, templateId, sp.groups, judge) : []), [mode, rule, templateId, sp.groups, judge])
  const ready = rows.filter((r) => r.tab === 'ready')
  const rowFilter = { decision: decisionFilter, hideAlready }
  // Only ticked rows the filters show are sent or marked; ticked rows a filter hides are counted, not acted on.
  const { selected, hidden } = visibleSelection(rows, unticked, rowFilter)
  const shown = (t: Tab) => rows.filter((r) => r.tab === t && passes(r, rowFilter))
  const firstSend = decisionTmpl && !emails.some((e) => e.templateId === templateId && e.state === 'sent' && !e.manual)

  // Step 2 on: the recipients picked, as their emails would be written now.
  const prepared = picked.map((k) => sp.byKey.get(k)).filter((g): g is SpeakerGroup => !!g)
    .map((g) => prepare(rule, source, g, judge, fields, { templateId, followUp }))
  const sendable = prepared.filter(canSend)
  const blocked = prepared.filter((p) => !canSend(p))
  const shownAt = Math.max(0, Math.min(at, prepared.length - 1))
  const current = prepared[shownAt]
  const anyCc = prepared.some((p) => p.cc.length > 0)

  const sendAt = when === 'now' ? null : date && time ? toIstanbulMs(date, time) : NaN
  const pastTime = sendAt !== null && (!Number.isFinite(sendAt) || sendAt <= now)

  const mark = async () => {
    setMarking('busy')
    setMarkNote(null)
    try {
      const r = await markEmailed({ templateId: templateId!, speakerKeys: selected, at: clock() })
      setMarkNote(`Marked ${plural(r.created, 'speaker')} as already emailed.`)
    } catch (e) {
      setMarkNote(`Couldn't mark them: ${errorText(e)}`)
    } finally {
      setMarking('idle')
    }
  }

  const submit = async () => {
    if (busy || sendable.length === 0) return
    const at = when === 'now' ? null : toIstanbulMs(date, time)
    if (at !== null && (!Number.isFinite(at) || at <= clock())) { setSendError('That time has passed. Pick a later one.'); return }
    const keys = sendable.map((p) => p.g.speakerKey)
    setBusy(true)
    setSendError(null)
    try {
      const r = await queueEmails({
        batchId, templateId, custom: custom ? draft : null, speakerKeys: keys, followUp, sendAt: at, includeCc, replyToThreadId: null,
      })
      setResult({ ...r, keys, sendAt: at })
      setStep(4)
    } catch (e) {
      setSendError(`Couldn't send: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const goPreview = () => { setPicked(selected); setAt(0); setStep(2) }
  const back = template ? `/emails/templates/${template.id}/send` : '/emails/templates'

  const nameOf = (k: string) => { const g = sp.byKey.get(k); return g ? speakerName(g) : k }
  const talkLink = (k: string) => { const id = sp.talkOf(k); return id ? `/talk/${id}` : null }

  // ---- Header
  const customGroup = custom && picked[0] ? sp.byKey.get(picked[0]) : undefined
  const crumbTo = custom ? (customGroup && talkLink(customGroup.speakerKey)) || '/emails' : '/emails/templates'
  const crumbText = custom ? (customGroup ? speakerName(customGroup) : 'Emails') : 'Templates'
  const head = (
    <>
      <div className="stepper"><Link className="crumb" to={crumbTo}><IconLeft />{crumbText}</Link></div>
      <div className="title-row" style={{ marginTop: 12 }}>
        <div>
          <h1>{custom ? 'Custom email' : `Send: ${template!.name}`}</h1>
          <p className="lede">{custom ? 'A one-off email to one speaker. Sent like any other, and kept in their history.' : RULES[rule].about}</p>
        </div>
        {!custom && <div className="actions"><Link className="btn" to={`/emails/templates/${template!.id}`}>Edit template</Link></div>}
      </div>
      {step < 4 && (
        <Steps step={step} offset={mode === 'batch' ? 1 : 2}
          names={custom ? ['Write', 'When'] : followUp ? ['Preview', 'When'] : ['Choose speakers', 'Preview', 'When']} />
      )}
    </>
  )

  // ---- Step 1: choose speakers
  if (step === 1) {
    const tabs: [Tab, string][] = decisionTmpl
      ? [['ready', 'Ready'], ['follow', 'Needs a follow-up'], ['not', 'Not ready']]
      : [['ready', 'Can get it'], ['not', "Can't get it"]]
    const list = shown(tab)
    const toggle = (k: string, on: boolean) => setUnticked((s) => { const n = new Set(s); if (on) n.delete(k); else n.add(k); return n })
    const ccNames = (r: RecipientRow) => r.g.cards.filter((c) => c.coSpeaker && r.cc.includes(c.coSpeaker.email.trim().toLowerCase()))
      .map((c) => c.coSpeaker!.firstName.trim() || c.coSpeaker!.email)
    const sentOn = (r: RecipientRow) => {
      const last = lastDecisionEmail(judge.historyOf(r.g.speakerKey))
      return last ? `Got the ${last.templateName}${last.sentAt ? ` on ${shortDate(last.sentAt.toMillis())}` : ''}, a talk approved since.` : ''
    }
    const followLink = (k: string) => `/emails/send?followUp=1&template=${encodeURIComponent(template!.id)}&speaker=${encodeURIComponent(k)}`
    return (
      <>
        {head}
        {firstSend && tab === 'ready' && (
          <div className="notice" style={{ marginTop: 16 }}>
            <span>
              <b>First {template!.name} send from the dashboard.</b> Have some of these speakers already been emailed outside it? Tick them
              and mark them, so they don't get it twice.{markNote && <> {markNote}</>}
            </span>
            {marking === 'confirm' ? (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', maxWidth: 420 }}>
                <span>Mark {nameList(selected.map(nameOf))} as already emailed?</span>
                <button className="btn sm text" onClick={() => setMarking('idle')}>Cancel</button>
                <button className="btn sm" onClick={() => void mark()}>Mark</button>
              </span>
            ) : (
              <button className="btn sm" style={{ marginLeft: 'auto', flex: 'none' }} disabled={marking === 'busy' || selected.length === 0}
                onClick={() => setMarking('confirm')}>
                {marking === 'busy' ? 'Marking…' : 'Mark ticked as already emailed'}
              </button>
            )}
          </div>
        )}
        <div className="filterbar" role="group" aria-label="Decision" style={{ marginTop: 16 }}>
          {DECISIONS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={k === decisionFilter} onClick={() => setDecisionFilter(k)}>{label}</button>
          ))}
          <label className="switch" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={hideAlready} onChange={(e) => setHideAlready(e.target.checked)} />
            <span className="track" />Hide those who already got it
          </label>
        </div>
        <div className="card table-card scroll-x" style={{ marginTop: 16 }}>
          <div className="tabs" role="tablist">
            {tabs.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {label} <span className="n num">{shown(k).length}</span>
              </button>
            ))}
          </div>
          {list.length > 0 ? (
            <table>
              <thead><tr><th /><th style={{ width: 220 }}>Speaker</th><th>Talks</th><th style={{ width: 260 }}>{tab === 'ready' ? 'Also gets it' : 'Why'}</th></tr></thead>
              <tbody>
                {list.map((r) => {
                  const k = r.g.speakerKey
                  const on = r.tab === 'ready'
                  const names = on ? ccNames(r) : []
                  return (
                    <tr key={k} className={on ? undefined : 'off'}>
                      <td style={{ width: 44 }}>
                        {on && <input type="checkbox" className="check" checked={!unticked.has(k)} aria-label={`Include ${speakerName(r.g)}`}
                          onChange={(e) => toggle(k, e.target.checked)} />}
                      </td>
                      <td>
                        <div className="cell-main">{speakerName(r.g)}</div>
                        <div className="cell-sub">{r.g.cards[0]?.company}</div>
                        {r.already && <span className="tag" style={{ marginTop: 4 }}>Already got this</span>}
                      </td>
                      <td>
                        {r.g.cards.map((c) => (
                          <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                            <StatusChip status={sp.status(c.id)} />
                            <span className="clip" style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                          </div>
                        ))}
                      </td>
                      <td>
                        {r.tab === 'follow' ? (
                          <>
                            <div className="why">{r.reason}. {sentOn(r)}</div>
                            <Link className="btn sm" style={{ marginTop: 6 }} to={followLink(k)}>Send follow-up…</Link>
                          </>
                        ) : on ? (
                          names.length > 0 ? <span className="why">Cc {names.join(', ')} (co-speaker)</span> : <span className="dash">—</span>
                        ) : (
                          <>
                            <span className="why">{r.reason}</span>
                            {r.reason === 'Already sent this template' && (
                              <div><Link className="btn sm" style={{ marginTop: 6 }} to={followLink(k)}>Send again…</Link></div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              <b>{tab === 'follow' ? 'No follow-ups needed' : 'Nobody here'}</b>
              {tab === 'follow' && 'Speakers whose decision changed after their email show up here.'}
            </div>
          )}
        </div>
        <div className="actionbar">
          <span><b className="num">{selected.length}</b> of {ready.length} selected{hidden > 0 && ` · ${hidden} hidden by filter`}</span><span className="grow" />
          <Link className="btn text" to="/emails/templates">Cancel</Link>
          <button className="btn primary" disabled={selected.length === 0} onClick={goPreview}>Preview {plural(selected.length, 'email')}</button>
        </div>
      </>
    )
  }

  // ---- Step 2: write (custom) or preview
  if (step === 2) {
    if (custom) {
      return (
        <>
          {head}
          <div className="editor">
            <section className="card pad" aria-label="Email">
              <div className="field">
                {speakerKey ? (
                  <><span className="label">To</span><div>{customGroup ? `${speakerName(customGroup)} · ${customGroup.cards[0]?.company ?? ''}` : 'Speaker not found'}</div></>
                ) : (
                  <>
                    <label htmlFor="to">To</label>
                    <span className="select" style={{ display: 'flex' }}>
                      <select id="to" style={{ width: '100%', maxWidth: 'none' }} value={picked[0] ?? ''} onChange={(e) => setPicked(e.target.value ? [e.target.value] : [])}>
                        <option value="">Pick a speaker</option>
                        {[...sp.groups].sort((a, b) => speakerName(a).localeCompare(speakerName(b))).map((g) => (
                          <option key={g.speakerKey} value={g.speakerKey}>{speakerName(g)}</option>
                        ))}
                      </select>
                    </span>
                  </>
                )}
              </div>
              <div className="field">
                <label htmlFor="subject">Subject</label>
                <input className="input" id="subject" value={draft.subject} placeholder="Subject" onChange={(e) => { test.reset(); setDraft((d) => ({ ...d, subject: e.target.value })) }} />
              </div>
              <div className="field">
                <label htmlFor="body">Message</label>
                <textarea className="area" id="body" value={draft.body} onChange={(e) => { test.reset(); setDraft((d) => ({ ...d, body: e.target.value })) }} />
                <span className="hint">Fill-ins work here too. This email isn't saved as a template.</span>
              </div>
            </section>
            <section className="card pad" aria-label="Preview">
              <div className="preview-head"><h2>Preview</h2>{current && test.button(current.g.speakerKey)}</div>
              {current ? (
                <>
                  {test.error(current.g.speakerKey)}
                  <MailView p={current} source={source} cc={includeCc} attachments={[]} />
                  <PreviewNotes p={current} />
                </>
              ) : <div className="empty">Pick a speaker to see the email.</div>}
            </section>
          </div>
          <div className="actionbar">
            <span className="grow" />
            <Link className="btn text" to={crumbTo}>Cancel</Link>
            <button className="btn primary" disabled={!current || !draft.subject.trim() || !draft.body.trim() || !canSend(current)} onClick={() => setStep(3)}>
              Next: when to send
            </button>
          </div>
        </>
      )
    }

    if (!current) {
      return (
        <>
          {head}
          <div className="card empty" style={{ marginTop: 16 }}><b>Speaker not found</b>They may have been removed from the sheet.</div>
        </>
      )
    }
    const history = judge.historyOf(current.g.speakerKey)
    const last = decisionTmpl ? lastDecisionEmail(history) : history.find((e) => e.templateId === templateId && e.state === 'sent')
    const lastOn = last?.sentAt ? ` on ${shortDate(last.sentAt.toMillis())}` : ''
    const step2 = (d: number) => setAt((a) => (a + d + prepared.length) % prepared.length)
    return (
      <>
        {head}
        {followUp && (
          <div className="notice" style={{ marginTop: 16 }}>
            {decisionTmpl ? (
              <span>
                <b>Follow-up for {speakerName(current.g)}.</b>{last && ` They got the ${last.templateName}${lastOn}.`} This {template!.name} lists
                only the {current.talkIds.length === 1 ? 'talk' : `${current.talkIds.length} talks`} approved since then.
              </span>
            ) : (
              <span><b>Sending {template!.name} to {speakerName(current.g)} again.</b>{last && ` They got it${lastOn}.`}</span>
            )}
          </div>
        )}
        {blocked.length > 0 && (
          <div className="notice" style={{ marginTop: 16 }}>
            <span>
              <b>{plural(blocked.length, 'email')} can't send yet.</b>{' '}
              {blocked.map((p) => `${p.g.name.first || speakerName(p.g)}: ${blockedReason(p)}`).join(' · ')}.{' '}
              <a href="/emails/event" target="_blank" rel="noopener">Fix in Event settings</a>{followUp ? '.' : ' or untick them.'}
            </span>
          </div>
        )}
        <div className="preview-grid">
          <section className="card pad" aria-label="Recipients">
            <div className="card-head"><h2>{plural(prepared.length, 'email')}</h2></div>
            <ul className="who-list">
              {prepared.map((p, i) => (
                <li key={p.g.speakerKey} aria-current={i === shownAt} tabIndex={0} onClick={() => setAt(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAt(i) } }}>
                  <span>{speakerName(p.g)}</span>
                  {!canSend(p) ? <span className="mstate warn">Blocked</span> : p.cc.length > 0 && includeCc ? <span className="tag">+ Cc</span> : null}
                </li>
              ))}
            </ul>
            {anyCc && (
              <label className="switch" style={{ marginTop: 16 }}>
                <input type="checkbox" checked={includeCc} onChange={(e) => setIncludeCc(e.target.checked)} />
                <span className="track" />Cc co-speakers
              </label>
            )}
          </section>
          <section className="card pad" aria-label="Preview">
            <div className="preview-head">
              <div className="seg">
                <button aria-label="Previous" onClick={() => step2(-1)}><IconLeft /></button>
                <button aria-label="Next" onClick={() => step2(1)}><IconRight /></button>
              </div>
              <span className="muted num">{shownAt + 1} of {prepared.length}</span>
              <span style={{ flex: 1 }} />
              {test.button(current.g.speakerKey)}
            </div>
            {test.error(current.g.speakerKey)}
            <MailView p={current} source={source} cc={includeCc} attachments={attachments} />
            <PreviewNotes p={current} />
          </section>
        </div>
        <div className="actionbar">
          <span>{blocked.length ? `${sendable.length} will send · ${blocked.length} blocked` : `${plural(prepared.length, 'email')} ready`}</span>
          <span className="grow" />
          {followUp ? <Link className="btn text" to={back}>Back</Link> : <button className="btn text" onClick={() => setStep(1)}>Back</button>}
          <button className="btn primary" disabled={sendable.length === 0} onClick={() => setStep(3)}>Next: when to send</button>
        </div>
      </>
    )
  }

  // ---- Step 3: when
  if (step === 3) {
    const n = sendable.length
    const label = when === 'now' ? `Send to ${plural(n, 'speaker')}` : `Schedule for ${plural(n, 'speaker')}`
    return (
      <>
        {head}
        <section className="card pad" style={{ marginTop: 16, maxWidth: 640 }}>
          <div className="when">
            <label className="radio-card">
              <input type="radio" name="when" value="now" checked={when === 'now'} onChange={() => setWhen('now')} />
              <b>Send now</b><span className="sub">Goes out within a minute, exactly as previewed.</span>
            </label>
            <label className="radio-card">
              <input type="radio" name="when" value="later" checked={when === 'later'} onChange={() => setWhen('later')} />
              <b>Schedule</b>
              <span className="sub">Written at send time, so event-setting changes made before then are used. If a speaker no longer qualifies, their email is held for you to check.</span>
              <span className="inline">
                <input className="input" type="date" aria-label="Date" value={date} onFocus={() => setWhen('later')} onChange={(e) => setDate(e.target.value)} />
                <input className="input" type="time" aria-label="Time" value={time} onFocus={() => setWhen('later')} onChange={(e) => setTime(e.target.value)} />
                <span className="hint">Istanbul time</span>
              </span>
            </label>
          </div>
          {when === 'later' && pastTime && <p className="inline-error" role="alert" style={{ marginTop: 12 }}>That time has passed. Pick a later one.</p>}
          {sendError && <p className="inline-error" role="alert" style={{ marginTop: 12 }}>{sendError}</p>}
          <p className="hint" style={{ marginTop: 16 }}>
            Sent from the team's speaker mailbox. It shows up in that mailbox's Sent folder, and replies arrive there and on each speaker's talk page.
          </p>
        </section>
        <div className="actionbar" style={{ maxWidth: 640 }}>
          <span className="grow" />
          <button className="btn text" disabled={busy} onClick={() => setStep(2)}>Back</button>
          <button className="btn primary" disabled={busy || n === 0 || (when === 'later' && pastTime)} onClick={() => void submit()}>
            {busy ? 'Queuing…' : label}
          </button>
        </div>
      </>
    )
  }

  // ---- After: each email's live state
  const r = result!
  const skipped = new Set(r.skipped.map((s) => s.speakerKey))
  const mine = new Map(emails.filter((e) => e.batchId === batchId).map((e) => [e.speakerKey, e]))
  const scheduled = r.sendAt !== null
  return (
    <>
      {head}
      <section className="card pad" style={{ marginTop: 16, maxWidth: 640 }}>
        <div className="card-head">
          <h2>{scheduled ? 'Scheduled' : 'Sending'}</h2>
          <span className="muted">{scheduled ? `${date.split('-').reverse().join('.')} at ${time} Istanbul time` : 'You can leave this page'}</span>
        </div>
        <ul className="hist">
          {r.keys.filter((k) => !skipped.has(k)).map((k) => {
            const e = mine.get(k)
            const to = talkLink(k)
            return (
              <li key={k}>
                <span>{to ? <Link to={to}>{nameOf(k)}</Link> : nameOf(k)}</span>
                {e ? <StateChip email={e} /> : <span className="mstate line">Queued</span>}
              </li>
            )
          })}
        </ul>
        {r.skipped.length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>Not sent</h3>
            <ul className="hist">
              {r.skipped.map((s) => (
                <li key={s.speakerKey}><span>{nameOf(s.speakerKey)}</span><span className="why">{s.reason}</span></li>
              ))}
            </ul>
          </>
        )}
      </section>
      <div className="actionbar" style={{ maxWidth: 640 }}>
        <span className="grow" />
        {!custom && <Link className="btn" to="/emails/templates">Back to templates</Link>}
        <Link className="btn primary" to="/emails">Open Emails</Link>
      </div>
    </>
  )
}

export default function SendPage() {
  const { me } = useAuth()
  const { id } = useParams()
  const [params] = useSearchParams()
  const { key } = useLocation()
  const { templates, loading } = useData()
  if (me?.role !== 'admin') return <Navigate to="/emails" replace />

  const custom = !id && params.get('custom') === '1'
  const followUp = !id && !custom && params.get('followUp') === '1'
  const templateId = id ?? (followUp ? params.get('template') : null)
  const speaker = params.get('speaker')
  if (!custom && (!templateId || (followUp && !speaker))) return <Navigate to="/emails/templates" replace />
  if (loading) return <p className="muted">Loading…</p>

  const template = templateId ? templates.find((t) => t.id === templateId) ?? null : null
  if (!custom && !template) {
    return (
      <>
        <div className="stepper"><Link className="crumb" to="/emails/templates"><IconLeft />Templates</Link></div>
        <div className="card empty" style={{ marginTop: 16 }}><b>Template not found</b>It may have been deleted.</div>
      </>
    )
  }
  const mode: Mode = custom ? 'custom' : followUp ? 'followUp' : 'batch'
  // A new visit (link followed) starts a new flow with a new batch id.
  return <Flow key={key} mode={mode} template={template} speakerKey={custom || followUp ? speaker : null} only={speaker} />
}
