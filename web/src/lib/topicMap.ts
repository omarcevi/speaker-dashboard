import type { AiMeta, Review, Status, TopicMap } from '../../../functions/src/model.ts'
import type { Card } from './cards.ts'
import { statusOf } from './status.ts'

export type MapDot = { card: Card; x: number; y: number; cluster: number; status: Status }
export type MapCluster = { id: number; label: string; count: number; cx: number; cy: number; r: number }

const PAD = 0.04

// One dot per present card: at its displayId's point, else any member's point. Cards with no point are skipped.
export function mapView(topicMap: TopicMap, cards: Card[], reviews: Map<string, Review>): { dots: MapDot[]; clusters: MapCluster[] } {
  const points = new Map(topicMap.points.map((p) => [p.id, p]))
  const dots: MapDot[] = []
  for (const card of cards) {
    if (card.removedFromSheet) continue
    const p = points.get(card.displayId) ?? card.memberIds.map((m) => points.get(m)).find((q) => q !== undefined)
    if (!p) continue
    dots.push({ card, x: p.x, y: p.y, cluster: p.cluster, status: statusOf(reviews, card.id) })
  }
  const clusters: MapCluster[] = []
  for (const { id, label } of topicMap.clusters) {
    const own = dots.filter((d) => d.cluster === id)
    if (own.length === 0) continue
    const cx = own.reduce((s, d) => s + d.x, 0) / own.length
    const cy = own.reduce((s, d) => s + d.y, 0) / own.length
    const r = Math.max(...own.map((d) => Math.hypot(d.x - cx, d.y - cy))) + PAD
    clusters.push({ id, label, count: own.length, cx, cy, r })
  }
  return { dots, clusters }
}

// Admin footnote on the AI job. The stored errors are already content-free, but this still shows only fixed text.
export function aiStatusNotes(meta: AiMeta | null, map: TopicMap | null): string[] {
  const notes: string[] = []
  if (meta && meta.pending > 0) notes.push(`Overviews pending: ${meta.pending}`)
  const problems = [
    meta?.error ? 'some overviews could not be generated' : null,
    map?.error ? 'the topic names could not be generated' : null,
  ].filter((p) => p !== null)
  if (problems.length > 0) notes.push(`Last AI run problem: ${problems.join('; ')}.`)
  return notes
}
