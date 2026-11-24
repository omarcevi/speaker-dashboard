import { useState } from 'react'
import { fillInsIn, validEventKey } from '../../../functions/src/email/fillIns.ts'
import type { EventField } from '../../../functions/src/model.ts'
import { cleanSignatureHtml, isBlankHtml, templateHtml } from '../../../functions/src/shared/emailHtml.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { EmailFrame } from '../components/EmailFrame.tsx'
import EmailsTabs from '../components/EmailsTabs.tsx'
import LazyRichEditor from '../components/LazyRichEditor.tsx'
import { saveEvent } from '../data/actions.ts'
import { useData } from '../data/DataProvider.tsx'
import { eventKeyOf, usesSignatureLayout } from '../lib/emails.ts'

const MAX_FIELDS = 50 // the rules' cap
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const LAYOUT_NOTE = "This signature uses a layout the visual editor can't keep. Edit it as HTML."

/**
 * The team signature, edited visually or as HTML. A signature with a table or inline styles (pasted from a Gmail
 * signature, say) opens as HTML, and switching it to the visual editor takes a second click.
 */
function SignatureEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [mode, setMode] = useState<'visual' | 'html'>(() => (usesSignatureLayout(value) ? 'html' : 'visual'))
  const [confirming, setConfirming] = useState(false)
  const layout = mode === 'html' && usesSignatureLayout(value)
  const toVisual = () => {
    if (mode === 'visual') return
    if (layout && !confirming) { setConfirming(true); return }
    setConfirming(false)
    setMode('visual')
  }
  return (
    <>
      <div className="sig-head">
        <div className="seg mode" role="group" aria-label="Signature editor">
          <button type="button" aria-pressed={mode === 'visual'} onClick={toVisual}>Visual</button>
          <button type="button" aria-pressed={mode === 'html'} onClick={() => { setConfirming(false); setMode('html') }}>HTML</button>
        </div>
        {layout && (
          <p className="hint" role={confirming ? 'alert' : undefined}>
            {LAYOUT_NOTE}
            {confirming && <> <button type="button" className="btn sm" onClick={toVisual}>Switch anyway</button></>}
          </p>
        )}
      </div>
      {mode === 'visual' ? (
        <LazyRichEditor value={value} ariaLabel="Team signature" fillIns={[]} onChange={onChange} />
      ) : (
        <div className="sig-html">
          <textarea className="area code" aria-label="Team signature HTML" spellCheck={false} value={value}
            onChange={(e) => onChange(e.target.value)} />
          {isBlankHtml(value) ? <p className="muted">No signature yet.</p> : <EmailFrame html={cleanSignatureHtml(value)} title="Signature preview" />}
        </div>
      )}
    </>
  )
}

function EventForm({ initial, initialSignature }: { initial: EventField[]; initialSignature: string }) {
  const { me } = useAuth()
  const admin = me?.role === 'admin'
  const { templates } = useData()
  const [base, setBase] = useState(initial)
  const [rows, setRows] = useState(initial)
  const [baseSignature, setBaseSignature] = useState(initialSignature)
  const [signature, setSignature] = useState(initialSignature)
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = JSON.stringify(base) !== JSON.stringify(rows) || baseSignature !== signature
  const usedBy = (key: string) => templates.filter((t) => fillInsIn(`${t.subject}\n${templateHtml(t)}`).includes(key)).map((t) => t.name)
  const newKey = eventKeyOf(label)
  const keyError = label.trim() === '' ? null : newKey === '' ? 'Use letters or digits in the label.' : validEventKey(newKey, rows.map((r) => r.key))
  const full = rows.length >= MAX_FIELDS

  const edit = (i: number, patch: Partial<EventField>) => { setSaved(false); setRows((r) => r.map((f, j) => (j === i ? { ...f, ...patch } : f))) }
  const add = () => {
    if (!newKey || keyError || full) return
    setSaved(false)
    setRows((r) => [...r, { key: newKey, label: label.trim(), value: '' }])
    setLabel('')
  }
  const save = async () => {
    const bad = rows.find((f, i) => validEventKey(f.key, rows.filter((_, j) => j !== i).map((o) => o.key)))
    if (bad) { setError(`The fill-in {{${bad.key}}} can't be used: remove it and add it again.`); return }
    setSaving(true)
    setError(null)
    try {
      const clean = rows.map((f) => ({ key: f.key, label: f.label.trim() || f.key, value: f.value.trim() }))
      // An emptied editor leaves "<p></p>"; store it as no signature.
      const sig = isBlankHtml(signature) ? '' : signature
      await saveEvent(clean, sig, { uid: me!.uid, name: me!.name })
      setBase(clean)
      setRows(clean)
      setBaseSignature(sig)
      setSignature(sig)
      setSaved(true)
    } catch (e) {
      setError(`Couldn't save: ${errorText(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Event settings</h1>
          <p className="lede">Values any template can use. Change one here and every future email uses the new value; sent emails keep what they said.</p>
        </div>
        {admin && (
          <div className="actions">
            {saved && !dirty && <span className="stamp" role="status">Saved</span>}
            <button className="btn primary" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </div>
      {error && <div className="banner" role="alert" style={{ marginTop: 16 }}>{error}</div>}
      <div className="settings">
        <section className="setting">
          <div className="about">
            <h2>Event details</h2>
            <p>Leave a value empty until you know it. A template that needs it shows a warning and won't send.</p>
            {!admin && <p>Only admins can change these.</p>}
          </div>
          <div className="card pad">
            {rows.length === 0 ? <p className="muted">No event settings yet.</p> : (
              <div className="event-rows">
                <span className="head">Label</span><span className="head">Fill-in</span><span className="head">Value</span><span />
                {rows.map((f, i) => {
                  const used = usedBy(f.key)
                  return (
                    <div key={f.key} className="event-field">
                      <input className="input" aria-label="Label" value={f.label} readOnly={!admin} onChange={(e) => edit(i, { label: e.target.value })} />
                      <code>{`{{${f.key}}}`}</code>
                      <div className="ef-value">
                        <input className="input" aria-label={`${f.label || f.key} value`} value={f.value} readOnly={!admin}
                          placeholder="Empty: emails that use it won't send" onChange={(e) => edit(i, { value: e.target.value })} />
                        {used.length > 0 && <div className="hint" style={{ marginTop: 4 }}>Used in {used.join(', ')}</div>}
                      </div>
                      {admin ? (
                        <button className="icon-btn ef-x" aria-label={`Remove ${f.label || f.key}`} style={{ margin: 0 }}
                          onClick={() => { setSaved(false); setRows((r) => r.filter((_, j) => j !== i)) }}>×</button>
                      ) : <span />}
                    </div>
                  )
                })}
              </div>
            )}
            {admin && (
              <form className="event-rows add-row" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--rule)' }}
                onSubmit={(e) => { e.preventDefault(); add() }}>
                <input className="input" value={label} placeholder="New setting, e.g. Wi-Fi password" aria-label="New setting label"
                  aria-describedby="new-key-error" disabled={full} onChange={(e) => setLabel(e.target.value)} />
                <code>{newKey ? `{{${newKey}}}` : '{{…}}'}</code>
                <span className={keyError ? 'inline-error' : 'hint'} id="new-key-error">
                  {full ? `Up to ${MAX_FIELDS} settings.` : keyError ?? ''}
                </span>
                <button className="btn sm" style={{ width: 'auto', padding: '0 10px' }} type="submit" disabled={full || !newKey || !!keyError}>Add</button>
              </form>
            )}
          </div>
        </section>
        <section className="setting">
          <div className="about">
            <h2>Team signature</h2>
            <p>Added to the end of every email, replies included.</p>
            {!admin && <p>Only admins can change it.</p>}
          </div>
          <div className="card pad">
            {admin ? (
              <SignatureEditor value={signature} onChange={(html) => { setSaved(false); setSignature(html) }} />
            ) : isBlankHtml(signature) ? <p className="muted">No signature yet.</p> : (
              <EmailFrame html={cleanSignatureHtml(signature)} title="Team signature" />
            )}
          </div>
        </section>
      </div>
    </>
  )
}

export default function EventSettingsPage() {
  const { event, loading } = useData()
  return (
    <>
      <EmailsTabs />
      {loading ? <p className="muted">Loading…</p> : <EventForm initial={event?.fields ?? []} initialSignature={event?.signatureHtml ?? ''} />}
    </>
  )
}
