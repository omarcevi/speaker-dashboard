import { useMemo } from 'react'
import { useData } from '../data/DataProvider.tsx'
import { logisticsRows, toCsv } from '../lib/logistics.ts'

function exportCsv(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'devfest-speakers-logistics.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function LogisticsPage() {
  const { submissions, reviews } = useData()
  const rows = useMemo(() => logisticsRows(submissions, reviews), [submissions, reviews])

  return (
    <div>
      <h1>Logistics</h1>
      {rows.length === 0 ? (
        <p>No approved speakers yet.</p>
      ) : (
        <>
          <button type="button" onClick={() => exportCsv(toCsv(rows))}>Export CSV</button>
          <table className="list-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Phone</th><th>Talks</th><th>From abroad</th><th>Coming from</th>
                <th>Outside Istanbul</th><th>City</th><th>Transport</th><th>Accommodation</th><th>Tour</th>
                <th>After party</th><th>T-shirt</th><th>Other requirements</th><th>Anything else</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}{r.kind === 'co-speaker' && <span className="tag">Co-speaker</span>}</td>
                  <td>{r.email}</td><td>{r.phone}</td><td>{r.talks}</td><td>{r.fromAbroad}</td><td>{r.abroadFrom}</td>
                  <td>{r.outsideIstanbul}</td><td>{r.city}</td><td>{r.transport}</td><td>{r.accommodation}</td><td>{r.tour}</td>
                  <td>{r.afterParty}</td><td>{r.tshirt}</td><td>{r.otherRequirements}</td><td>{r.anythingElse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
