import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Stage } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import EmailsTabs from '../components/EmailsTabs.tsx'
import { saveStages } from '../data/actions.ts'
import { useData } from '../data/DataProvider.tsx'
import { newStage, stagesProblem, withoutEarlierTemplate, withTemplate } from '../lib/stages.ts'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function ManageStagesPage() {
  const { me } = useAuth()
  const { stages, templates, loading, stagesFailed } = useData()
  const [draft, setDraft] = useState<Stage[] | null>(null) // null until the first edit: follows the live stages
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = draft ?? stages

  // Nothing is edited while saving: the save resets the draft, which would drop the change.
  const change = (next: Stage[]) => { if (saving) return; setDraft(next); setSaved(false); setError(null) }
  const edit = (i: number, patch: Partial<Stage>) => change(list.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const move = (i: number, to: number) => {
    const next = [...list]
    ;[next[i], next[to]] = [next[to], next[i]]
    change(next)
  }
  const add = () => {
    if (templates.length === 0) { setError('Create a template first'); return }
    // Start on a template no stage uses yet, so the new stage doesn't tick everyone who got another stage's email.
    const free = templates.find((t) => !list.some((s) => s.templateIds.includes(t.id))) ?? templates[0]
    change([...list, newStage(crypto.randomUUID(), free.id)])
  }

  const save = async () => {
    if (loading || stagesFailed) return
    const problem = stagesProblem(list, templates)
    if (problem) { setError(problem); setSaved(false); return }
    setSaving(true)
    setError(null)
    try {
      await saveStages(list, { uid: me!.uid, name: me!.name })
      setDraft(null) // follow the stored stages again, so later changes by others show
      setSaved(true)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <EmailsTabs />
      <div className="title-row">
        <div><h1>Manage stages</h1><p className="lede"><Link to="/emails/stages">Stages</Link> · the series of emails each approved speaker should get, in order</p></div>
        <div className="actions"><Link className="btn" to="/emails/stages">Back to Stages</Link></div>
      </div>
      {stagesFailed && <div className="banner" role="alert" style={{ marginTop: 16 }}>Couldn’t load the saved stages, so they can’t be saved over. Reload the page to try again.</div>}
      {loading ? (
        <div className="card table-card" style={{ marginTop: 20 }}><div className="empty">Loading…</div></div>
      ) : (
        <>
          <fieldset className="stage-set" disabled={saving}>
            <ol className="stage-list" style={{ marginTop: 20 }}>
              {list.map((s, i) => {
                const current = s.templateIds[0] ?? ''
                const deleted = !templates.some((t) => t.id === current)
                const label = s.name || 'stage'
                return (
                  <li key={s.id} className="card stage">
                    <div className="ord">
                      <button type="button" className="icon-btn" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                      <b>{i + 1}</b>
                      <button type="button" className="icon-btn" aria-label={`Move ${label} down`} disabled={i === list.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                    </div>
                    <div className="fields">
                      <div className="field"><label htmlFor={`n${s.id}`}>Name</label><input id={`n${s.id}`} className="input" value={s.name} onChange={(e) => edit(i, { name: e.target.value })} /></div>
                      <div className="field">
                        <label htmlFor={`t${s.id}`}>Template it sends</label>
                        <select id={`t${s.id}`} className="input" value={deleted ? '' : current} onChange={(e) => change(list.map((x, j) => (j === i ? withTemplate(x, e.target.value, stages) : x)))}>
                          {deleted && <option value="" disabled>Choose a template…</option>}
                          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        {deleted && s.templateIds.length > 0 && <span className="warn-line">Template deleted. This stage can’t send until you pick another; past sends still count.</span>}
                        {s.templateIds.length > 1 && (
                          <div className="earlier">
                            <span className="hint">Earlier templates:</span>
                            {s.templateIds.slice(1).map((t) => {
                              const name = templates.find((x) => x.id === t)?.name ?? t
                              return (
                                <span key={t} className="earlier-item">
                                  {name}
                                  <button type="button" className="icon-btn" aria-label={`Remove earlier template ${name} from ${label}`}
                                    onClick={() => change(list.map((x, j) => (j === i ? withoutEarlierTemplate(x, t) : x)))}>×</button>
                                </span>
                              )
                            })}
                            <span className="hint">Sends from earlier templates still count for this stage. Remove one only if it was never meant for this stage.</span>
                          </div>
                        )}
                      </div>
                      <div className="field">
                        <label htmlFor={`d${s.id}`}>Due from</label>
                        <input id={`d${s.id}`} className="input" type="date" value={s.dueFrom ?? ''} onChange={(e) => edit(i, { dueFrom: e.target.value || null })} />
                        <span className="hint">Empty: never flagged as missing</span>
                      </div>
                      <div className="field">
                        <label htmlFor={`a${s.id}`}>Applies to</label>
                        <select id={`a${s.id}`} className="input" value={s.appliesTo} onChange={(e) => edit(i, { appliesTo: e.target.value === 'added' ? 'added' : 'everyone' })}>
                          <option value="everyone">Everyone</option>
                          <option value="added">Only speakers I add</option>
                        </select>
                      </div>
                    </div>
                    <div className="foot">
                      <span className="hint">Changing the template keeps emails already sent counted for this stage.</span>
                      <button type="button" className="btn sm text" onClick={() => change(list.filter((_, j) => j !== i))}>Remove stage</button>
                    </div>
                  </li>
                )
              })}
            </ol>
          </fieldset>
          <div className="savebar">
            {error && <span className="error" role="alert">{error}</span>}
            {saved && !error && <span className="hint" role="status">Saved</span>}
            <button type="button" className="btn" disabled={saving} onClick={add}>Add stage</button>
            <button type="button" className="btn primary" disabled={saving || stagesFailed} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      )}
    </>
  )
}
