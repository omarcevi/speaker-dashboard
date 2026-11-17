import { useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useData } from '../data/DataProvider.tsx'
import { functions } from '../firebase.ts'
import type { Card } from '../lib/cards.ts'
import { overviewState, regenerateFailure } from '../lib/overview.ts'
import { loadOverviewOpen, saveOverviewOpen } from '../lib/prefs.ts'

export default function OverviewBox({ card }: { card: Card }) {
  const { me } = useAuth()
  const { ai } = useData()
  const [open, setOpen] = useState(loadOverviewOpen)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const state = overviewState(card, ai)
  const doc = state.doc
  const o = doc?.overview ?? null

  async function regenerate() {
    setBusy(true)
    setFailure(null)
    try {
      // The function may run for up to 300 s; the client default (70 s) would give up while it still works.
      await httpsCallable(functions, 'regenerateAi', { timeout: 300_000 })({ id: card.displayId })
    } catch (e) {
      if (!mounted.current) return
      setFailure(regenerateFailure(e))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  if (state.kind === 'hidden') return null

  const flags = o ? ([
    ['Abstract', o.abstract], ['Community', o.community], ['Speaking', o.speaking], ['Student', o.student],
  ] as const) : []

  return (
    <section className="card pad overview-card" aria-label="Gemini overview">
      <div className="card-head" style={{ marginBottom: open ? 12 : 0 }}>
        <h2>Gemini overview</h2>
        <span className="ai-note">
          Based only on what the speaker wrote
          {me?.role === 'admin' && (
            <span className="regenerate"> · <button type="button" className="link-btn" onClick={() => void regenerate()} disabled={busy}>{busy ? 'Regenerating…' : 'Regenerate'}</button></span>
          )}
          {' · '}
          <button type="button" className="link-btn" aria-expanded={open} onClick={() => { setOpen(!open); saveOverviewOpen(!open) }}>{open ? 'Hide' : 'Show'}</button>
        </span>
      </div>
      {failure && <p className="inline-error" role="alert" style={{ marginBottom: 12 }}>{failure}</p>}
      {open && (
        <>
          {state.kind === 'missing' && <p className="muted">Overview not ready yet. It appears a few minutes after a talk syncs.</p>}
          {state.kind === 'updating' && <p className="muted">Updating for the latest version of this talk…</p>}
          {o && (
            <div className={state.kind === 'updating' ? 'overview-dim' : undefined}>
              <p className="prose" style={{ fontSize: 15, lineHeight: '24px' }}>{o.talk} {o.speaker}</p>
              <dl className="flags">
                {flags.map(([label, f]) => <div key={label} style={{ display: 'contents' }}><dt>{label}</dt><dd><b>{f.value}</b><span>{f.why}</span></dd></div>)}
              </dl>
            </div>
          )}
          {doc?.error && <p className="muted" style={{ marginTop: 12 }}>The last attempt to generate this overview failed.</p>}
        </>
      )}
    </section>
  )
}
