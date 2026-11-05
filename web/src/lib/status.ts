import type { Review, Status, Submission } from '../../../functions/src/model.ts'

export function statusOf(reviews: Map<string, Review>, id: string): Status {
  return reviews.get(id)?.status ?? 'pending'
}

export function statusCounts(subs: Submission[], reviews: Map<string, Review>): Record<Status | 'all', number> {
  const counts = { all: 0, pending: 0, maybe: 0, approved: 0, declined: 0 }
  for (const s of subs) {
    if (s.removedFromSheet) continue
    counts.all++
    counts[statusOf(reviews, s.id)]++
  }
  return counts
}
