import { STATUSES, type Status } from '../../../functions/src/model.ts'
import { statusLabel } from './StatusChip.tsx'

type Counts = Record<Status | 'all', number>

// Five count cards (All and the four statuses) over a strip of the four colours in proportion. Picking a card is the
// status filter on the list and the highlight on the topic map.
export default function StatusFilter({ counts, active, onSelect, label }: {
  counts: Counts
  active: Status | 'all'
  onSelect: (s: Status | 'all') => void
  label: string
}) {
  return (
    <>
      <div className="counts" role="group" aria-label={label}>
        {(['all', ...STATUSES] as const).map((s) => (
          <button key={s} type="button" className={s === 'all' ? 'count' : `count st-${s}`} aria-pressed={active === s} onClick={() => onSelect(s)}>
            <span className="label">{s !== 'all' && <span className="dot" />}{s === 'all' ? 'All' : statusLabel(s)}</span>
            <span className="value">{counts[s]}</span>
          </button>
        ))}
      </div>
      <div className="strip" aria-hidden="true">
        {STATUSES.filter((s) => counts[s] > 0).map((s) => <i key={s} className={`st-${s}`} style={{ flex: counts[s] }} />)}
      </div>
    </>
  )
}
