import { STATUSES, type Review, type Score, type Status, type Submission } from '../../../functions/src/model.ts'
import { summarizeScores, type ScoreSummary } from './scores.ts'
import { statusOf } from './status.ts'
import { compareSubmitted } from './time.ts'

export interface ListRow<T extends Submission = Submission> {
  sub: T
  status: Status
  score: ScoreSummary
  commentCount: number
  otherTalkCount: number
}

export interface ListFilter {
  status: Status | 'all'
  topic: string | null
  level: string | null
  language: string | null
  q: string
  showRemoved: boolean
}

export type SortKey = 'score' | 'spread' | 'date'

export function searchKey(s: string): string {
  return s.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i')
}

export function buildRows<T extends Submission>(
  subs: T[],
  reviews: Map<string, Review>,
  scores: Map<string, Score[]>,
  comments: Map<string, unknown[]>,
  myUid: string,
  showAll: boolean,
): ListRow<T>[] {
  const perSpeaker = new Map<string, number>()
  for (const s of subs) {
    if (!s.removedFromSheet) perSpeaker.set(s.speakerKey, (perSpeaker.get(s.speakerKey) ?? 0) + 1)
  }
  return subs.map((sub) => ({
    sub,
    status: statusOf(reviews, sub.id),
    score: summarizeScores(scores.get(sub.id) ?? [], myUid, showAll),
    commentCount: comments.get(sub.id)?.length ?? 0,
    otherTalkCount: (perSpeaker.get(sub.speakerKey) ?? 0) - (sub.removedFromSheet ? 0 : 1),
  }))
}

export function applyFilter<T extends Submission>(rows: ListRow<T>[], f: ListFilter): ListRow<T>[] {
  const q = searchKey(f.q.trim())
  return rows.filter(({ sub, status }) => {
    if (sub.removedFromSheet && !f.showRemoved) return false
    if (f.status !== 'all' && status !== f.status) return false
    if (f.topic !== null && sub.topicGroup !== f.topic) return false
    if (f.level !== null && sub.level !== f.level) return false
    if (f.language !== null && sub.language !== f.language) return false
    if (q === '') return true
    return [sub.title, sub.firstName, sub.lastName, sub.company, sub.email].some((v) => searchKey(v).includes(q))
  })
}

export function sortRows<T extends Submission>(rows: ListRow<T>[], key: SortKey): ListRow<T>[] {
  const byDate = (a: ListRow<T>, b: ListRow<T>) => compareSubmitted(a.sub, b.sub)
  if (key === 'date') return [...rows].sort(byDate)
  const metric = (r: ListRow<T>): number | null =>
    r.score.avg === null ? null : key === 'score' ? r.score.avg : (r.score.max ?? 0) - (r.score.min ?? 0)
  return [...rows].sort((a, b) => {
    const ma = metric(a)
    const mb = metric(b)
    if (ma !== null && mb !== null) return mb - ma || byDate(a, b)
    if (ma !== null) return -1
    if (mb !== null) return 1
    return byDate(a, b)
  })
}

export function readQuery(p: URLSearchParams): { filter: ListFilter; sort: SortKey } {
  const status = p.get('status')
  const sort = p.get('sort')
  return {
    filter: {
      status: STATUSES.includes(status as Status) ? (status as Status) : 'all',
      topic: p.get('topic') || null,
      level: p.get('level') || null,
      language: p.get('language') || null,
      q: p.get('q') ?? '',
      showRemoved: p.get('removed') === '1',
    },
    sort: sort === 'score' || sort === 'spread' ? sort : 'date',
  }
}

export function writeQuery(filter: ListFilter, sort: SortKey): URLSearchParams {
  const p = new URLSearchParams()
  if (filter.status !== 'all') p.set('status', filter.status)
  if (filter.topic) p.set('topic', filter.topic)
  if (filter.level) p.set('level', filter.level)
  if (filter.language) p.set('language', filter.language)
  if (filter.q) p.set('q', filter.q)
  if (filter.showRemoved) p.set('removed', '1')
  if (sort !== 'date') p.set('sort', sort)
  return p
}
