import { useMemo, type ReactNode } from 'react'
import { IconDownload } from '../components/Icons.tsx'
import { useData } from '../data/DataProvider.tsx'
import { comingFrom, isYes, logisticsRows, toCsv, tshirtCounts, type LogisticsRow } from '../lib/logistics.ts'

function exportCsv(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'devfest-speakers-logistics.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function Answer({ value, kind }: { value: string; kind: LogisticsRow['kind'] }) {
  if (kind === 'co-speaker' || !value.trim()) return <span className="dash">—</span>
  return isYes(value) ? <span className="yes">{value}</span> : <span className="muted">{value}</span>
}

export default function LogisticsPage() {
  const { cards, submissions, reviews, loading } = useData()
  const rows = useMemo(() => logisticsRows(cards, submissions, reviews), [cards, submissions, reviews])
  const speakers = rows.filter((r) => r.kind === 'speaker')
  const co = rows.length - speakers.length
  const yes = (k: 'accommodation' | 'transport' | 'tour' | 'afterParty') => speakers.filter((r) => isYes(r[k])).length
  const abroad = speakers.filter((r) => comingFrom(r).note === 'From abroad').length
  const sizes = tshirtCounts(speakers.map((r) => r.tshirt))

  const cell = (label: string, content: ReactNode) => <td data-label={label}>{content}</td>
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Logistics</h1>
          <p className="lede">{plural(speakers.length, 'approved speaker')} and {plural(co, 'co-speaker')} · from their Form answers</p>
        </div>
        {rows.length > 0 && <button className="btn primary" onClick={() => exportCsv(toCsv(rows))}><IconDownload />Export CSV</button>}
      </div>
      {loading ? <p className="muted" style={{ marginTop: 24 }}>Loading…</p> : rows.length === 0 ? (
        <div className="card empty" style={{ marginTop: 24 }}><b>No approved speakers yet</b>Approved talks' speakers appear here with their travel and T-shirt answers.</div>
      ) : (
        <>
          <dl className="card summary">
            <div><dt>Need accommodation</dt><dd className="num">{yes('accommodation')}</dd></div>
            <div><dt>Need transport</dt><dd className="num">{yes('transport')}</dd></div>
            <div><dt>From abroad</dt><dd className="num">{abroad}</dd></div>
            <div><dt>Istanbul tour</dt><dd className="num">{yes('tour')}</dd></div>
            <div><dt>After party</dt><dd className="num">{yes('afterParty')}</dd></div>
            <div><dt>T-shirts</dt><dd className="num">{sizes.length ? sizes.map(([s, n]) => <span key={s}>{n}<small> {s}</small> </span>) : <span className="dash">—</span>}</dd></div>
          </dl>
          <div className="card table-card scroll-x">
            <table className="resp labelled">
              <thead>
                <tr><th style={{ width: 240 }}>Person</th><th style={{ width: 220 }}>Talks</th><th>Coming from</th><th>Transport</th><th>Accommodation</th><th>Tour</th><th>After party</th><th>T-shirt</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const from = comingFrom(r)
                  const notes = [r.otherRequirements, r.anythingElse].filter((v) => v.trim()).join(' · ')
                  return (
                    <tr key={i}>
                      <td>
                        <div className="cell-main">{r.name}{r.kind === 'co-speaker' && <> <span className="tag">Co-speaker</span></>}</div>
                        {r.email && <div className="cell-sub"><a href={`mailto:${r.email}`}>{r.email}</a></div>}
                        {r.phone && <div className="cell-sub num">{r.phone}</div>}
                        {r.formAnswers === 'unreviewed' && <div className="cell-sub"><span className="tag wrap">Unreviewed Form response: confirm with the speaker</span></div>}
                        {r.formAnswers === 'no' && <div className="cell-sub"><span className="tag">No Form answers yet</span></div>}
                      </td>
                      {cell('Talks', r.talks.split(' | ').map((t, j) => <div key={j}>{t}</div>))}
                      {cell('Coming from', r.kind === 'co-speaker' || !from.place ? <span className="dash">—</span>
                        : <>{from.place}{from.note && <div className="cell-sub">{from.note}</div>}</>)}
                      {cell('Transport', <Answer value={r.transport} kind={r.kind} />)}
                      {cell('Accommodation', <Answer value={r.accommodation} kind={r.kind} />)}
                      {cell('Tour', <Answer value={r.tour} kind={r.kind} />)}
                      {cell('After party', <Answer value={r.afterParty} kind={r.kind} />)}
                      {cell('T-shirt', r.tshirt.trim() ? r.tshirt : <span className="dash">—</span>)}
                      {cell('Notes', notes ? <div className="clip" title={notes}>{notes}</div> : <span className="dash">—</span>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="table-foot"><span>Co-speakers have no logistics answers; the Form doesn't ask them.</span><span>{plural(rows.length, 'person', 'people')}</span></div>
          </div>
        </>
      )}
    </>
  )
}
