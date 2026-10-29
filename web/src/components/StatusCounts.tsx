import { STATUSES, type Status } from '../../../functions/src/model.ts'
import { statusLabel } from './StatusChip.tsx'

interface Props {
  counts: Record<Status | 'all', number>
  active: Status | 'all'
  onSelect: (s: Status | 'all') => void
}

export default function StatusCounts({ counts, active, onSelect }: Props) {
  return (
    <div className="chips status-counts">
      {(['all', ...STATUSES] as const).map((s) => (
        <button
          key={s}
          className={`chip chip-btn${active === s ? ' active' : ''}`}
          style={{ background: s === 'all' ? undefined : `var(--st-${s})` }}
          onClick={() => onSelect(s)}
        >
          {s === 'all' ? 'All' : statusLabel(s)} {counts[s]}
        </button>
      ))}
    </div>
  )
}
