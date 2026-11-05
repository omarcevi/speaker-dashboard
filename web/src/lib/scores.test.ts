import { describe, expect, it } from 'vitest'
import { summarizeScores } from './scores.ts'
import { fakeScore } from './testing.ts'

const scores = [fakeScore('s', 'A', 'Ann', 4), fakeScore('s', 'B', 'Bob', 5), fakeScore('s', 'C', 'Cy', 4)]

describe('summarizeScores', () => {
  it('hides details from an outsider', () => {
    expect(summarizeScores(scores, 'X', false)).toMatchObject({ revealed: false, count: 3, avg: null, entries: [] })
  })
  it('reveals to a scorer', () => {
    expect(summarizeScores(scores, 'A', false)).toMatchObject({ revealed: true, mine: 4, avg: 4.3, min: 4, max: 5 })
  })
  it('reveals with showAll', () => {
    const s = summarizeScores(scores, 'X', true)
    expect(s.revealed).toBe(true)
    expect(s.mine).toBeNull()
    expect(s.entries.map((e) => e.name)).toEqual(['Ann', 'Bob', 'Cy'])
  })
  it('handles no scores', () => {
    expect(summarizeScores([], 'A', true)).toMatchObject({ count: 0, avg: null })
  })
})
