import type { Status } from '../../../functions/src/model.ts'

const LABELS: Record<Status, string> = { pending: 'Pending', maybe: 'Maybe', approved: 'Approved', declined: 'Declined' }

export function statusLabel(s: Status): string {
  return LABELS[s]
}

// The only coloured mark in the app: a pale pill in the status's own hue with a dot of the full colour.
export default function StatusChip({ status }: { status: Status }) {
  return <span className={`status st-${status}`}>{LABELS[status]}</span>
}
