import type { Review, Status } from '../../../functions/src/model.ts'

export function statusOf(reviews: Map<string, Review>, id: string): Status {
  return reviews.get(id)?.status ?? 'pending'
}
