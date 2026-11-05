import { useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useData } from '../data/DataProvider.tsx'
import { functions } from '../firebase.ts'
import type { Card } from '../lib/cards.ts'
import { overviewState } from '../lib/overview.ts'
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
      await httpsCallable(functions, 'regenerateAi')({ id: card.displayId })
    } catch (e) {
      if (!mounted.current) return
      const msg = e instanceof Error ? e.message : String(e)
      setFailure(msg === 'internal' ? 'Could not regenerate this overview — try again later.' : msg)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const flags = o ? ([
    ['Abstract', o.abstract], ['Community', o.community], ['Speaking', o.speaking], ['Student', o.student],
  ] as const) : []

  return (
    <details className="overview" open={open} onToggle={(e) => {
      const v = e.currentTarget.open
      if (v !== open) { setOpen(v); saveOverviewOpen(v) }
    }}>
      <summary>
        <b>✨ Gemini overview</b> <span className="muted">Based only on what the speaker wrote</span>
      </summary>
      {state.kind === 'missing' && <p className="muted">Overview not ready yet</p>}
      {state.kind === 'updating' && <p className="muted">Updating…</p>}
      {o && (
        <div className={state.kind === 'updating' ? 'overview-body dim' : 'overview-body'}>
          <p><b>Talk:</b> {o.talk}</p>
          <p><b>Speaker:</b> {o.speaker}</p>
          <div className="chips">
            {flags.map(([label, f]) => <span key={label} className="chip" title={f.why}>{label}: {f.value}</span>)}
          </div>
          <ul className="overview-why">
            {flags.map(([label, f]) => <li key={label}><b>{label}:</b> {f.why}</li>)}
          </ul>
        </div>
      )}
      {doc?.error && <p className="muted">The last attempt to generate this overview failed.</p>}
      {me?.role === 'admin' && (
        <p>
          <button type="button" className="link-btn" onClick={() => void regenerate()} disabled={busy}>
            {busy ? 'Regenerating…' : 'Regenerate'}
          </button>
          {failure && <span className="inline-error"> {failure}</span>}
        </p>
      )}
    </details>
  )
}
