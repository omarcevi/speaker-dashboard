import type { Count } from '../lib/balance.ts'

// What has been approved so far, so a decision can be weighed against the programme's balance.
export default function ApprovedSoFar({ balance }: { balance: { topic: Count[]; language: Count[]; level: Count[] } }) {
  const total = balance.topic.reduce((n, c) => n + c.n, 0)
  const max = Math.max(1, ...balance.topic.map((c) => c.n))
  const line = (counts: Count[]) => counts.length ? counts.map((c) => `${c.label} ${c.n}`).join(' · ') : <span className="dash">—</span>
  return (
    <section className="card pad" aria-label="Approved so far">
      <div className="card-head"><h2>Approved so far</h2><span className="muted num">{total} {total === 1 ? 'talk' : 'talks'}</span></div>
      {total === 0 ? <p className="muted">Nothing approved yet.</p> : (
        <>
          <ul className="bars">
            {balance.topic.map((c) => (
              <li key={c.label}><span>{c.label}</span><span className="num">{c.n}</span><span className="bar"><i style={{ width: `${(c.n / max) * 100}%` }} /></span></li>
            ))}
          </ul>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Language</dt><dd>{line(balance.language)}</dd>
            <dt>Level</dt><dd>{line(balance.level)}</dd>
          </dl>
        </>
      )}
    </section>
  )
}
