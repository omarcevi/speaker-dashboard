import type { Card } from './cards.ts'

// The card shows a different document than the one reviewed (the reviewed primary was removed).
export function versionWarning(card: Card): string | null {
  if (card.displayId === card.id) return null
  return `Showing a different ${card.source === 'advocu' ? 'Advocu' : 'Form'} version than the one reviewed`
}
