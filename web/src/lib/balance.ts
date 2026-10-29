import type { Review, Submission } from '../../../functions/src/model.ts'
import { statusOf } from './status.ts'

export interface Count { label: string; n: number }

function tally(values: string[]): Count[] {
  const m = new Map<string, number>()
  for (const v of values) if (v !== '') m.set(v, (m.get(v) ?? 0) + 1)
  return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
}

export function approvedBalance(subs: Submission[], reviews: Map<string, Review>): { topic: Count[]; language: Count[]; level: Count[] } {
  const approved = subs.filter((s) => !s.removedFromSheet && !s.noSession && statusOf(reviews, s.id) === 'approved')
  return {
    topic: tally(approved.map((s) => s.topicGroup)),
    language: tally(approved.map((s) => s.language)),
    level: tally(approved.map((s) => s.level)),
  }
}
