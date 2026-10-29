import type { Score } from '../../../functions/src/model.ts'

export interface ScoreSummary {
  mine: number | null
  revealed: boolean
  count: number
  avg: number | null
  min: number | null
  max: number | null
  entries: { name: string; value: number }[]
}

export function summarizeScores(scores: Score[], myUid: string, showAll: boolean): ScoreSummary {
  const mine = scores.find((s) => s.uid === myUid)?.value ?? null
  const revealed = mine !== null || showAll
  const count = scores.length
  if (!revealed || count === 0) {
    return { mine, revealed, count, avg: null, min: null, max: null, entries: [] }
  }
  const values = scores.map((s) => s.value)
  const avg = Math.round((values.reduce((a, b) => a + b, 0) / count) * 10) / 10
  return {
    mine,
    revealed,
    count,
    avg,
    min: Math.min(...values),
    max: Math.max(...values),
    entries: scores.map((s) => ({ name: s.name, value: s.value })).sort((a, b) => a.name.localeCompare(b.name)),
  }
}
