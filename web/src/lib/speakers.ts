import type { Card } from './cards.ts'
import { compareSubmitted } from './time.ts'

export function otherTalks(cards: Card[], current: Card): Card[] {
  return cards
    .filter((c) => c.speakerKey === current.speakerKey && c.id !== current.id && !c.removedFromSheet)
    .sort(compareSubmitted)
}
