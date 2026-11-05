import type { Submission } from '../../../functions/src/model.ts'

// Form timestamps are M/D/YYYY H:MM:SS in Istanbul time (UTC+3, no DST).
const FORM_TIMESTAMP = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/

// When the talk was submitted, in UTC milliseconds; null when the timestamp doesn't parse.
export function submittedAtMs(sub: Submission): number | null {
  if (sub.source === 'advocu') {
    const ms = Date.parse(sub.timestamp)
    return Number.isNaN(ms) ? null : ms
  }
  const m = FORM_TIMESTAMP.exec(sub.timestamp)
  if (!m) return null
  const [mo, d, y, h, mi, s] = m.slice(1).map(Number)
  return Date.UTC(y, mo - 1, d, h - 3, mi, s)
}

// Submission order: by submission time with unknown times last, then by sheet row, then by id.
export function compareSubmitted(a: Submission, b: Submission): number {
  const ta = submittedAtMs(a)
  const tb = submittedAtMs(b)
  if (ta !== null && tb !== null && ta !== tb) return ta - tb
  if (ta === null && tb !== null) return 1
  if (ta !== null && tb === null) return -1
  return a.row - b.row || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
