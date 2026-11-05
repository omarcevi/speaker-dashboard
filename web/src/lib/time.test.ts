import { describe, expect, it } from 'vitest'
import { submittedAtMs } from './time.ts'
import { fakeSub } from './testing.ts'

describe('submittedAtMs', () => {
  it('reads form timestamps as Istanbul time (UTC+3)', () => {
    expect(submittedAtMs(fakeSub({ id: 'row-2', row: 2, timestamp: '11/5/2026 9:05:00' }))).toBe(Date.UTC(2026, 10, 5, 6, 5, 0))
  })
  it('reads advocu timestamps as ISO UTC', () => {
    expect(submittedAtMs(fakeSub({ id: 'a', row: 0, source: 'advocu', timestamp: '2026-10-05T09:30:00.000Z' }))).toBe(Date.UTC(2026, 9, 5, 9, 30))
  })
  it('returns null for anything that does not parse', () => {
    expect(submittedAtMs(fakeSub({ id: 'row-3', row: 3, timestamp: 'garbage' }))).toBeNull()
    expect(submittedAtMs(fakeSub({ id: 'row-4', row: 4, timestamp: '' }))).toBeNull()
    expect(submittedAtMs(fakeSub({ id: 'b', row: 0, source: 'advocu', timestamp: 'garbage' }))).toBeNull()
  })
})
