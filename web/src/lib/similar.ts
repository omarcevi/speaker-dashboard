import type { AiDoc, Review } from '../../../functions/src/model.ts'
import { cardFor, type Card } from './cards.ts'
import { statusOf } from './status.ts'

export const CLOSE = 0.75
export const VERY_SIMILAR = 0.85
const NEIGHBOR_LIMIT = 30
const TOP = 5

export type Similar = {
  closeCount: number
  capped: boolean
  approvedClose: number
  veryAlikeApproved: Card[]
  top: { card: Card; score: number }[]
}

export type SimilarState = 'hidden' | 'not-ready' | 'ready'

// No ai doc: the panel is hidden. A placeholder (no overview) or a doc with no neighbours yet would show
// "0 submissions close · 0 already approved", which reads as a fact, so it says "not ready yet" instead.
export function similarState(doc: AiDoc | undefined): SimilarState {
  if (!doc) return 'hidden'
  return !doc.overview || doc.neighbors.length === 0 ? 'not-ready' : 'ready'
}

// Closeness bar width in percent. Cosine scores can be negative.
export const barWidth = (score: number) => (Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score * 100))) : 0)

// Neighbours come from the AI doc (ids of submission docs); statuses are always read live from `reviews`.
export function similarFor(card: Card, cards: Card[], ai: Map<string, AiDoc>, reviews: Map<string, Review>): Similar {
  const neighbors = ai.get(card.displayId)?.neighbors ?? []
  const best = new Map<string, { card: Card; score: number }>()
  for (const n of neighbors) {
    if (card.memberIds.includes(n.id)) continue
    const c = cardFor(cards, n.id)
    if (!c || c.id === card.id || c.removedFromSheet) continue
    const prev = best.get(c.id)
    if (!prev || n.score > prev.score) best.set(c.id, { card: c, score: n.score })
  }
  const all = [...best.values()].sort((a, b) => b.score - a.score)
  const close = all.filter((e) => e.score >= CLOSE)
  const isApproved = (e: { card: Card }) => statusOf(reviews, e.card.id) === 'approved'
  return {
    closeCount: close.length,
    capped: neighbors.length >= NEIGHBOR_LIMIT && neighbors[neighbors.length - 1].score >= CLOSE,
    approvedClose: close.filter(isApproved).length,
    veryAlikeApproved: all.filter((e) => e.score >= VERY_SIMILAR && isApproved(e)).map((e) => e.card),
    top: all.slice(0, TOP),
  }
}
