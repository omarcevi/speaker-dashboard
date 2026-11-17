import { useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import type { ImportSummary } from '../../../functions/src/model.ts'
import { useData } from '../data/DataProvider.tsx'
import { functions } from '../firebase.ts'
import RefreshButton, { SyncProblems } from '../components/RefreshButton.tsx'
import { describeSync, formatWhen } from '../lib/syncStatus.ts'

type Req = { csv: string; mode: 'preview' | 'apply' }

function Counts({ s, applied }: { s: ImportSummary; applied: boolean }) {
  const tally: [string, number][] = [['New', s.added], ['Updated', s.updated], ['Unchanged', s.unchanged], [applied ? 'Hidden' : 'Will be hidden', s.hidden]]
  return (
    <>
      <dl className="tally">
        {tally.map(([label, n]) => <div key={label}><dt>{label}</dt><dd className="num">{n}</dd></div>)}
      </dl>
      <dl className="kv" style={{ marginTop: 20, gridTemplateColumns: '180px minmax(0, 1fr)' }}>
        <dt>Restored</dt><dd className="num">{s.restored}</dd>
        <dt>Merged with Form talks</dt><dd className="num">{s.merged}</dd>
        <dt>Speakers</dt><dd className="num">{s.speakers}</dd>
        {s.rematched > 0 && <><dt>Re-matched</dt><dd className="num">{s.rematched} (date changed in Advocu)</dd></>}
      </dl>
      {s.hidden > 0 && <div className="notice" style={{ marginTop: 16 }}>{s.hidden} {s.hidden === 1 ? 'application was' : 'applications were'} missing from this file{applied ? ` and ${s.hidden === 1 ? 'is' : 'are'} now hidden` : ' and will be hidden'}. Their reviews are kept.</div>}
    </>
  )
}

export default function ImportPage() {
  const { advocuMeta, sync } = useData()
  const [csv, setCsv] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportSummary | null>(null)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

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
  const syncInfo = describeSync(sync)

  return (
    <>
      <div className="title-row"><div><h1>Import</h1><p className="lede">Where talks come from: the Google Form sheet and Advocu.</p></div></div>
      <div className="settings">
        <section className="setting">
          <div className="about">
            <h2>Google Form sheet</h2>
            <p>Syncs every 15 minutes, and when anyone presses Refresh on Submissions. Decisions, scores and comments are never touched by a sync.</p>
          </div>
          <div className="card pad">
            <dl className="kv">
              <dt>Last sync</dt><dd>{sync?.lastSyncedAt ? formatWhen(sync.lastSyncedAt.toMillis()) : 'Not synced yet'}{sync?.total !== undefined && ` · ${sync.total} rows`}</dd>
              <dt>Problems</dt><dd>{syncInfo.error || syncInfo.missingColumns.length ? 'See below' : 'None'}</dd>
            </dl>
            <SyncProblems />
            <div className="notice" style={{ marginTop: 16 }}>Don't sort or delete rows in the Form Responses tab. Each row is a talk's identity; use filter views instead.</div>
            <div style={{ marginTop: 16 }}><RefreshButton label="Sync now" stamp={false} /></div>
          </div>
        </section>
        <section className="setting">
          <div className="about">
            <h2>Advocu applications</h2>
            <p>Upload the CSV export from Advocu. You'll see what changes before anything is written.</p>
            <p style={{ marginTop: 12 }}>{lastLine}</p>
          </div>
          <div className="card pad">
            {!shown && (
              <label className={dragging ? 'drop over' : 'drop'} style={{ display: 'block', cursor: busy ? 'default' : 'pointer' }}
                onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) void onFile(e.dataTransfer.files[0]) }}>
                <input type="file" className="vh" aria-label="Advocu CSV export" accept=".csv,text/csv" disabled={busy}
                  onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
                <b>{busy ? 'Reading the file…' : 'Choose a CSV file'}</b><br />or drop it here
              </label>
            )}
            {error && <div className="inline-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
            {shown && (
              <>
                <div className="card-head"><h2>{result ? 'Imported' : 'Preview'}</h2><span className="muted num">{shown.total} {shown.total === 1 ? 'application' : 'applications'}</span></div>
                <Counts s={shown} applied={result !== null} />
                {shown.cfpTitles.length > 0 && <p style={{ marginTop: 16 }}><span className="muted">Calls for papers: </span>{shown.cfpTitles.join(', ')}</p>}
                {shown.warnings.length > 0 && <div className="notice" role="alert" style={{ marginTop: 16, display: 'block' }}>{shown.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>}
                {shown.rejected.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <b style={{ fontWeight: 500 }}>Skipped rows</b>
                    <ul style={{ marginTop: 4 }}>{shown.rejected.map((r, i) => <li key={i} className="muted">Row {r.row}: {r.reason}</li>)}</ul>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  {preview && preview.total > 0 && csv !== null && (
                    <button className="btn primary" disabled={busy} onClick={() => void call(csv, 'apply')}>
                      {busy ? 'Importing…' : `Import ${preview.total} ${preview.total === 1 ? 'application' : 'applications'}`}
                    </button>
                  )}
                  <button className="btn text" disabled={busy} onClick={() => { setPreview(null); setResult(null); setCsv(null); setError(null) }}>
                    {result ? 'Import another file' : 'Choose another file'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
