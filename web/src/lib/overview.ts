import type { AiDoc } from '../../../functions/src/model.ts'
import type { Card } from './cards.ts'

export type OverviewState = { kind: 'missing' } | { kind: 'updating'; doc: AiDoc } | { kind: 'ready'; doc: AiDoc }

// Read from the displayed document. A doc without an overview (e.g. a placeholder after a failed first
// generation) is always missing; 'updating' needs an existing overview built from older content.
export function overviewState(card: Card, ai: Map<string, AiDoc>): OverviewState {
  const doc = ai.get(card.displayId)
  if (!doc || !doc.overview) return { kind: 'missing' }
  return doc.sourceHash !== card.contentHash ? { kind: 'updating', doc } : { kind: 'ready', doc }
}
