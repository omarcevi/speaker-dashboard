import { cellLabel, cellTone, type Cell, type CellKind } from '../lib/stages.ts'

const OPENS: ReadonlySet<CellKind> = new Set<CellKind>(['sent', 'manual', 'replied', 'answer', 'bounced', 'problem', 'scheduled', 'sending'])

interface Props {
  cell: Cell
  admin: boolean
  /** Reads the conversation (sent-type cells). */
  onOpen: () => void
  /** Opens the cell menu (admins, on no-email and exception cells). */
  onMenu: () => void
  /** The cell's conversation or menu is currently open. */
  expanded: boolean
}

function Face({ cell }: { cell: Cell }) {
  const tone = cellTone(cell)
  if (cell.kind === 'notFor') {
    return <><span className="faint" aria-hidden="true">–</span><span className="vh">Not for this speaker</span></>
  }
  if (cell.kind === 'blank') return <span className="faint" aria-label="No email, no due date">–</span>
  if (tone === 'faint') return <span className="faint">{cellLabel(cell)}</span>
  return <span className={`mstate${tone ? ` ${tone}` : ''}`}>{cellLabel(cell)}</span>
}

export default function StageCell({ cell, admin, onOpen, onMenu, expanded }: Props) {
  if (OPENS.has(cell.kind)) {
    return <button type="button" className="cellbtn" aria-pressed={expanded} onClick={onOpen}><Face cell={cell} /></button>
  }
  if (!admin) return <span className="cellbtn static"><Face cell={cell} /></span>
  return <button type="button" className="cellbtn" aria-haspopup="menu" aria-expanded={expanded} onClick={onMenu}><Face cell={cell} /></button>
}
