import { useRef, useState, type DragEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { fillInLabel, isFillInName, renderEmail, SPEAKER_FILL_INS } from '../../../functions/src/email/fillIns.ts'
import { fillInValues, type SpeakerGroup } from '../../../functions/src/email/recipients.ts'
import type { EmailTemplate, EventField, RecipientRule, TemplateAttachment } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { IconLeft } from '../components/Icons.tsx'
import Marked from '../components/Marked.tsx'
import { newTemplateId, saveTemplate, uploadTemplateAttachment, type TemplateInput } from '../data/actions.ts'
import { useData } from '../data/DataProvider.tsx'
import { useSpeakers, type Speakers } from '../data/useSpeakers.ts'
import {
  emptyEventFillIns, formatBytes, MAX_ATTACHMENT_BYTES, RULE_ORDER, RULES, unknownFillIns,
} from '../lib/emails.ts'
import { formatWhen } from '../lib/syncStatus.ts'

type Template = EmailTemplate & { id: string }
const MAX_ATTACHMENTS = 10 // the rules' cap
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const blank: TemplateInput = { name: '', rule: 'approved', subject: '', body: '', attachments: [] }
const inputOf = (t: Template): TemplateInput => ({ name: t.name, rule: t.rule, subject: t.subject, body: t.body, attachments: t.attachments })
const same = (a: TemplateInput, b: TemplateInput) => JSON.stringify(a) === JSON.stringify(b)

// Talks a preview covers when the speaker can't get this template right now: what the rule would list.
function talksFor(rule: RecipientRule, g: SpeakerGroup, sp: Speakers): string[] {
  const all = g.cards.map((c) => c.id)
  if (rule === 'decline' || rule === 'anyone') return all
  const approved = all.filter((id) => sp.status(id) === 'approved')
  return approved.length ? approved : all
}

function Preview({ id, draft, fields }: { id: string; draft: TemplateInput; fields: EventField[] }) {
  const sp = useSpeakers()
  // Speakers this template is for (or already went to); anyone if nobody fits yet.
  const fits = sp.groups.filter((g) => {
    const e = sp.eligible(draft.rule, g, id)
    return e.ok || e.reason === 'Already sent this template' || e.reason === 'Already had a decision email'
  })
  const list = fits.length ? fits : sp.groups
  const [picked, setPicked] = useState<string | null>(null)
  const g = list.find((x) => x.speakerKey === picked) ?? list[0]

  let values: Record<string, string>
  let cc: string[] = []
  if (g) {
    const e = sp.eligible(draft.rule, g, id)
    values = fillInValues(g, e.ok ? e.talkIds : talksFor(draft.rule, g, sp), fields)
    if (e.ok) cc = e.cc
  } else {
    values = { ...Object.fromEntries(SPEAKER_FILL_INS.map((k) => [k, ''])), ...Object.fromEntries(fields.map((f) => [f.key, f.value])) }
  }
  const rendered = renderEmail(draft, values)
  const name = g ? `${g.name.first} ${g.name.last}`.trim() : ''

  return (
    <section className="card pad" aria-label="Preview" style={{ position: 'sticky', top: 16 }}>
      <div className="preview-head">
        <h2>Preview</h2>
        {g && (
          <span className="select">
            <label className="vh" htmlFor="who">Preview for</label>
            <select id="who" value={g.speakerKey} onChange={(e) => setPicked(e.target.value)}>
              {list.map((x) => <option key={x.speakerKey} value={x.speakerKey}>{`${x.name.first} ${x.name.last}`.trim()}</option>)}
            </select>
          </span>
        )}
      </div>
      <div className="mail">
        <dl className="mail-h">
          <dt>From</dt><dd>DevFest Istanbul</dd>
          <dt>To</dt><dd>{g ? `${name} <${g.email}>` : <span className="muted">No speakers yet</span>}</dd>
          {cc.length > 0 && <><dt>Cc</dt><dd>{cc.join(', ')}</dd></>}
          <dt>Subject</dt><dd className="subj">{draft.subject ? <Marked text={draft.subject} values={values} /> : <span className="muted">No subject</span>}</dd>
        </dl>
        <div className="mail-b">{draft.body ? <Marked text={draft.body} values={values} /> : <span className="muted">Start writing on the left.</span>}</div>
        {draft.attachments.length > 0 && (
          <div className="mail-att">
            {draft.attachments.map((a) => <span key={a.path} className="att">{a.name} <span className="muted">{formatBytes(a.size)}</span></span>)}
          </div>
        )}
      </div>
      {!rendered.ok && g && (
        <p className="warn-line" style={{ marginTop: 12 }}>
          <span>Won't send to {name} yet: {[...rendered.missing, ...rendered.empty].map(fillInLabel).join(', ')}</span>
        </p>
      )}
      <p className="hint" style={{ marginTop: 12 }}>
        Grey marks are filled in for this speaker. A dashed box means a fill-in is unknown, malformed or empty, and the email won't send until it's fixed.
      </p>
    </section>
  )
}

function Editor({ id, saved, isNew }: { id: string; saved: Template | null; isNew: boolean }) {
  const { me } = useAuth()
  const admin = me?.role === 'admin'
  const { event } = useData()
  const fields = event?.fields ?? []
  const navigate = useNavigate()
  const [base, setBase] = useState<TemplateInput>(() => (saved ? inputOf(saved) : blank))
  const [draft, setDraft] = useState<TemplateInput>(base)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const subjectEl = useRef<HTMLInputElement>(null)
  const bodyEl = useRef<HTMLTextAreaElement>(null)
  const lastField = useRef<'subject' | 'body'>('body')
  const fileEl = useRef<HTMLInputElement>(null)

  const dirty = !same(base, draft)
  const set = (patch: Partial<TemplateInput>) => setDraft((d) => ({ ...d, ...patch }))
  const unknown = unknownFillIns(draft, fields)
  const empty = emptyEventFillIns(draft, fields)

  const insert = (name: string) => {
    const which = lastField.current
    const el = which === 'subject' ? subjectEl.current : bodyEl.current
    if (!el) return
    const value = draft[which]
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? start
    const token = `{{${name}}}`
    set({ [which]: value.slice(0, start) + token + value.slice(end) })
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + token.length })
  }

  const save = async (): Promise<boolean> => {
    if (draft.name.trim() === '') { setError('Give the template a name.'); return false }
    if (draft.subject.trim() === '') { setError('Add a subject.'); return false }
    setSaving(true)
    setError(null)
    try {
      await saveTemplate(id, draft, { uid: me!.uid, name: me!.name })
      setBase(draft)
      return true
    } catch (e) {
      setError(`Couldn't save: ${errorText(e)}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setFileError(null)
    const total = draft.attachments.reduce((n, a) => n + a.size, 0) + files.reduce((n, f) => n + f.size, 0)
    if (total >= MAX_ATTACHMENT_BYTES) {
      setFileError(`Attachments must stay under 20 MB in total; this would make ${formatBytes(total)}.`)
      return
    }
    if (draft.attachments.length + files.length > MAX_ATTACHMENTS) {
      setFileError(`A template can have at most ${MAX_ATTACHMENTS} attachments.`)
      return
    }
    setUploading(true)
    try {
      const added: TemplateAttachment[] = []
      for (const f of files) added.push(await uploadTemplateAttachment(id, f))
      setDraft((d) => ({ ...d, attachments: [...d.attachments, ...added] }))
    } catch (e) {
      setFileError(`Couldn't upload: ${errorText(e)}`)
    } finally {
      setUploading(false)
    }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (admin && !uploading) void addFiles([...e.dataTransfer.files])
  }

  const updated = saved?.updatedAt?.toMillis()
  return (
    <>
      <div className="stepper"><Link className="crumb" to="/emails/templates"><IconLeft />Templates</Link></div>
      <div className="title-row" style={{ marginTop: 12 }}>
        <div>
          <h1>{base.name || 'New template'}</h1>
          {saved && <p className="lede">Last edited by {saved.updatedByName} · {updated ? formatWhen(updated) : 'just now'}</p>}
          {!admin && <p className="lede">Only admins can edit templates.</p>}
        </div>
        {admin && (
          <div className="actions">
            {dirty && !isNew && <button className="btn" disabled={saving} onClick={() => { setDraft(base); setError(null) }}>Discard changes</button>}
            <button className="btn" disabled={saving || uploading || (!dirty && !isNew)}
              onClick={async () => { if (await save() && isNew) navigate(`/emails/templates/${id}`, { replace: true }) }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn primary" disabled={saving || uploading}
              onClick={async () => { if (!dirty && !isNew) navigate(`/emails/templates/${id}/send`); else if (await save()) navigate(`/emails/templates/${id}/send`) }}>
              {dirty || isNew ? 'Save and send…' : 'Send…'}
            </button>
          </div>
        )}
      </div>
      {error && <div className="banner" role="alert" style={{ marginTop: 16 }}>{error}</div>}
      <div className="editor">
        <section className="card pad" aria-label="Template">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input className="input" id="name" value={draft.name} readOnly={!admin} placeholder="e.g. Event info" onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="rule">Who gets it</label>
            <span className="select" style={{ display: 'flex' }}>
              <select id="rule" style={{ width: '100%', maxWidth: 'none' }} value={draft.rule} disabled={!admin}
                onChange={(e) => set({ rule: e.target.value as RecipientRule })}>
                {RULE_ORDER.map((r) => <option key={r} value={r}>{RULES[r].label}</option>)}
              </select>
            </span>
            <span className="hint">{RULES[draft.rule].about}</span>
          </div>
          <div className="field">
            <label htmlFor="subject">Subject</label>
            <input ref={subjectEl} className="input" id="subject" value={draft.subject} readOnly={!admin}
              onFocus={() => { lastField.current = 'subject' }} onChange={(e) => set({ subject: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="body">Message</label>
            <textarea ref={bodyEl} className="area" id="body" value={draft.body} readOnly={!admin}
              onFocus={() => { lastField.current = 'body' }} onChange={(e) => set({ body: e.target.value })} />
            <div>
              {unknown.map((n) => (
                <div key={`u-${n}`} className="warn-line" style={{ marginTop: 6 }}>
                  <span>{isFillInName(n) ? `{{${n}}} isn't a known fill-in.` : `${n} isn't a valid fill-in. Use letters and digits in double braces, like {{firstName}}.`}</span>
                </div>
              ))}
              {empty.map((n) => (
                <div key={`e-${n}`} className="warn-line" style={{ marginTop: 6 }}>
                  <span>Event setting {`{{${n}}}`} is empty. <Link to="/emails/event">Fill it in</Link></span>
                </div>
              ))}
            </div>
          </div>
          {admin && (
            <div className="field">
              <span className="label">Insert a fill-in at the cursor</span>
              <div className="chip-group">
                <span className="hint">Speaker</span>
                <div className="chips">{SPEAKER_FILL_INS.map((k) => <button key={k} type="button" className="chip" onClick={() => insert(k)}>{k}</button>)}</div>
              </div>
              <div className="chip-group">
                <span className="hint">Event · <Link to="/emails/event">edit values</Link></span>
                <div className="chips">
                  {fields.length === 0 && <span className="hint">No event settings yet.</span>}
                  {fields.map((f) => <button key={f.key} type="button" className="chip" title={f.value || 'Empty'} onClick={() => insert(f.key)}>{f.key}</button>)}
                </div>
              </div>
            </div>
          )}
          <div className="field">
            <span className="label">Attachments</span>
            <div className="chips">
              {draft.attachments.length === 0 && <span className="hint">None</span>}
              {draft.attachments.map((a, i) => (
                <span key={a.path} className="att">
                  {a.name} <span className="muted">{formatBytes(a.size)}</span>
                  {admin && (
                    <button type="button" className="link-btn" aria-label={`Remove ${a.name}`}
                      onClick={() => setDraft((d) => ({ ...d, attachments: d.attachments.filter((_, j) => j !== i) }))}>Remove</button>
                  )}
                </span>
              ))}
            </div>
            {admin && (
              <div className={over ? 'drop over' : 'drop'} style={{ padding: 16, marginTop: 4 }}
                onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
                {uploading ? 'Uploading…' : (
                  <><b>Drop a file</b> or <button type="button" className="link-btn" onClick={() => fileEl.current?.click()}>browse</button> · up to 20 MB in total</>
                )}
                <input ref={fileEl} type="file" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void addFiles(f) }} />
              </div>
            )}
            {fileError && <p className="inline-error" role="alert">{fileError}</p>}
          </div>
        </section>
        <Preview id={id} draft={draft} fields={fields} />
      </div>
    </>
  )
}

export default function TemplateEditPage() {
  const { id } = useParams()
  const { me } = useAuth()
  const { templates, loading } = useData()
  const [freshId] = useState(newTemplateId)
  if (!id) {
    if (me?.role !== 'admin') return <Navigate to="/emails/templates" replace />
    return <Editor key={freshId} id={freshId} saved={null} isNew />
  }
  if (loading) return <p className="muted">Loading…</p>
  const saved = templates.find((t) => t.id === id)
  if (!saved) {
    return (
      <>
        <div className="stepper"><Link className="crumb" to="/emails/templates"><IconLeft />Templates</Link></div>
        <div className="card empty" style={{ marginTop: 16 }}><b>Template not found</b>It may have been deleted.</div>
      </>
    )
  }
  return <Editor key={id} id={id} saved={saved} isNew={false} />
}
