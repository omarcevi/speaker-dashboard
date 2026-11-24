import { cellLabel, cellTone, type Cell, type CellKind } from '../lib/stages.ts'

const OPENS: ReadonlySet<CellKind> = new Set<CellKind>(['sent', 'manual', 'replied', 'answer', 'bounced', 'problem', 'scheduled', 'sending'])

/** What a cell with no text on it (a dash) says to a screen reader. */
const UNSEEN: Partial<Record<CellKind, string>> = { notFor: 'Not for this speaker', blank: 'No email, no due date' }

interface Props {
  cell: Cell
  admin: boolean
  /** Reads the conversation, or the talk page (sent-type cells); null when there is neither. */
  onOpen: (() => void) | null
  /** Opens the cell menu under this button (admins, on no-email and exception cells). */
  onMenu: (button: HTMLButtonElement) => void
  /** The cell's conversation or menu is currently open. */
  expanded: boolean
}

function Face({ cell }: { cell: Cell }) {
  const tone = cellTone(cell)
  if (UNSEEN[cell.kind]) return <span className="faint" aria-hidden="true">–</span>
  if (tone === 'faint') return <span className="faint">{cellLabel(cell)}</span>
  return <span className={`mstate${tone ? ` ${tone}` : ''}`}>{cellLabel(cell)}</span>
}

export default function StageCell({ cell, admin, onOpen, onMenu, expanded }: Props) {
  const unseen = UNSEEN[cell.kind]
  if (OPENS.has(cell.kind) && onOpen) {
    return <button type="button" className="cellbtn" aria-pressed={expanded} onClick={onOpen}><Face cell={cell} /></button>
  }
  if (!admin || OPENS.has(cell.kind)) {
    return <span className="cellbtn static"><Face cell={cell} />{unseen && <span className="vh">{unseen}</span>}</span>
  }
  return (
    <button type="button" className="cellbtn" aria-haspopup="menu" aria-expanded={expanded} aria-label={unseen}
      onClick={(e) => onMenu(e.currentTarget)}>
      <Face cell={cell} />
    </button>
  )
}
