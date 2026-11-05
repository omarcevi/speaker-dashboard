import type { Count } from '../lib/balance.ts'

function Group({ title, counts }: { title: string; counts: Count[] }) {
  return (
    <>
      <span className="muted">{title}:</span>
      {counts.length === 0 ? <span className="muted">none yet</span> : counts.map((c) => (
        <span key={c.label} className="chip">{c.label} {c.n}</span>
      ))}
    </>
  )
}

export default function BalanceRow({ balance }: { balance: { topic: Count[]; language: Count[]; level: Count[] } }) {
  return (
    <div className="chips balance-row">
      <Group title="Approved by topic" counts={balance.topic} />
      <Group title="Language" counts={balance.language} />
      <Group title="Level" counts={balance.level} />
    </div>
  )
}
