import type { AiDoc } from '../../../functions/src/model.ts'
import type { Card } from './cards.ts'

export type OverviewState =
  | { kind: 'hidden'; doc?: undefined }
  | { kind: 'missing'; doc?: AiDoc }
  | { kind: 'updating'; doc: AiDoc }
  | { kind: 'ready'; doc: AiDoc }

// Read from the displayed document. Removed and no-session talks are never in the AI corpus, so the box is hidden
// rather than "not ready yet" forever. A doc without an overview (e.g. a placeholder after a failed first
// generation) is always missing; 'updating' needs an existing overview built from older content.
export function overviewState(card: Card, ai: Map<string, AiDoc>): OverviewState {
  if (card.removedFromSheet || card.noSession) return { kind: 'hidden' }
  const doc = ai.get(card.displayId)
  if (!doc || !doc.overview) return doc ? { kind: 'missing', doc } : { kind: 'missing' }
  return doc.sourceHash !== card.contentHash ? { kind: 'updating', doc } : { kind: 'ready', doc }
}

// What to show when the regenerateAi call fails, keyed on the Functions error code (`functions/<code>`).
export function regenerateFailure(e: unknown): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? (e as { code: unknown }).code : undefined
  if (code === 'functions/internal') return 'Could not regenerate this overview — try again later.'
  if (code === 'functions/deadline-exceeded') return "Still working — the overview will update when it's ready."
  return e instanceof Error ? e.message : String(e)
}
