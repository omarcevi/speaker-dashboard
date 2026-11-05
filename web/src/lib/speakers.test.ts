import { describe, expect, it } from 'vitest'
import { buildCards, cardFor } from './cards.ts'
import { otherTalks } from './speakers.ts'
import { fakeSub } from './testing.ts'

describe('otherTalks', () => {
  it('returns the speaker\'s other talks in submission order, excluding removed', () => {
    const cards = buildCards([
      fakeSub({ id: 'x', row: 9, speakerKey: 's' }),
      fakeSub({ id: 'a', row: 5, speakerKey: 's' }),
      fakeSub({ id: 'y', row: 2, speakerKey: 's' }),
      fakeSub({ id: 'r', row: 3, speakerKey: 's', removedFromSheet: true }),
      fakeSub({ id: 'o', row: 4, speakerKey: 'other' }),
    ], () => false)
    expect(otherTalks(cards, cardFor(cards, 'a')!).map((s) => s.id)).toEqual(['y', 'x'])
  })
  it('counts a merged talk once', () => {
    const cards = buildCards([
      fakeSub({ id: 'row-5', row: 5, speakerKey: 's', title: 'Cur' }),
      fakeSub({ id: 'row-9', row: 9, speakerKey: 's', title: 'Same talk', timestamp: '10/2/2026 10:00:00' }),
      fakeSub({ id: 'advocu-a', row: 0, source: 'advocu', speakerKey: 's', title: 'Same Talk', timestamp: '2026-10-01T10:00:00.000Z' }),
    ], () => false)
    expect(otherTalks(cards, cardFor(cards, 'row-5')!).map((s) => s.id)).toEqual(['row-9'])
  })
  it('orders form and advocu talks by submission time', () => {
    const cards = buildCards([
      fakeSub({ id: 'row-5', row: 5, speakerKey: 's', title: 'Cur' }),
      fakeSub({ id: 'advocu-b', row: 0, source: 'advocu', speakerKey: 's', title: 'Later', timestamp: '2026-10-03T10:00:00.000Z' }),
      fakeSub({ id: 'row-9', row: 9, speakerKey: 's', title: 'Earlier', timestamp: '10/2/2026 10:00:00' }),
    ], () => false)
    expect(otherTalks(cards, cardFor(cards, 'row-5')!).map((s) => s.id)).toEqual(['row-9', 'advocu-b'])
  })
})
