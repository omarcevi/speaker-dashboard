import { useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import type { ImportSummary } from '../../../functions/src/model.ts'
import { useData } from '../data/DataProvider.tsx'
import { functions } from '../firebase.ts'

type Req = { csv: string; mode: 'preview' | 'apply' }

function Counts({ s }: { s: ImportSummary }) {
  const items: [string, number][] = [
    ['New', s.added], ['Updated', s.updated], ['Unchanged', s.unchanged], ['Restored', s.restored],
    ['Hidden', s.hidden], ['Merged with Form talks', s.merged], ['Speakers', s.speakers],
  ]
  return (
    <ul>
      {items.map(([label, n]) => (
        label === 'Hidden' && n > 0
          ? <li key={label} className="count-warning">{label}: <b>{n}</b> — will be hidden because they're missing from this file</li>
          : <li key={label}>{label}: <b>{n}</b></li>
      ))}
    </ul>
  )
}

export default function ImportPage() {
  const { advocuMeta } = useData()
  const [csv, setCsv] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportSummary | null>(null)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const last = advocuMeta?.lastImportAt
  const lastLine = last
    ? `Last import: ${new Date(last.toMillis()).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} by ${advocuMeta?.byName ?? 'unknown'} — ${advocuMeta?.total ?? 0} applications`
    : 'No Advocu import yet'

  async function call(text: string, mode: Req['mode']) {
    setBusy(true)
    setError(null)
    try {
      const res = await httpsCallable<Req, ImportSummary>(functions, 'importAdvocu')({ csv: text, mode })
      if (mode === 'preview') { setPreview(res.data); setResult(null) } else { setResult(res.data); setPreview(null); setCsv(null) }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File | undefined) {
    setPreview(null)
    setResult(null)
    setError(null)
    if (!file) { setCsv(null); return }
    try {
      const text = await file.text()
      setCsv(text)
      await call(text, 'preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const shown = preview ?? result

  return (
    <div>
      <h1>Import Advocu applications</h1>
      <p className="muted">{lastLine}</p>
      <input
        type="file"
        aria-label="Advocu CSV export"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }}
      />
      {error && <div className="inline-error" role="alert">{error}</div>}
      {shown && (
        <section>
          <h2>{result ? 'Imported' : 'Preview'}</h2>
          <Counts s={shown} />
          {shown.cfpTitles.length > 0 && (
            <>
              <h3>Calls for papers</h3>
              <ul>{shown.cfpTitles.map((t) => <li key={t}>{t}</li>)}</ul>
            </>
          )}
          {shown.warnings.length > 0 && (
            <div className="banner" role="alert">
              {shown.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
          {shown.rejected.length > 0 && (
            <>
              <h3>Rejected rows</h3>
              <ul>{shown.rejected.map((r, i) => <li key={i}>Row {r.row}: {r.reason}</li>)}</ul>
            </>
          )}
        </section>
      )}
      {preview && preview.total > 0 && csv !== null && (
        <button disabled={busy} onClick={() => void call(csv, 'apply')}>
          {busy ? 'Importing…' : `Import ${preview.total} applications`}
        </button>
      )}
    </div>
  )
}
