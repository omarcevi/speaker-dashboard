import type { Status } from '../../../functions/src/model.ts'

const LABELS: Record<Status, string> = { pending: 'Pending', maybe: 'Maybe', approved: 'Approved', declined: 'Declined' }

export function statusLabel(s: Status): string {
  return LABELS[s]
}

export default function StatusChip({ status }: { status: Status }) {
  return <span className="chip" style={{ background: `var(--st-${status})` }}>{LABELS[status]}</span>
}
