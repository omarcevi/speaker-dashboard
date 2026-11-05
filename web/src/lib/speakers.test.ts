import { describe, expect, it } from 'vitest'
import { otherTalks } from './speakers.ts'
import { fakeSub } from './testing.ts'

describe('otherTalks', () => {
  it('returns the speaker\'s other talks in row order, excluding removed', () => {
    const cur = fakeSub({ id: 'a', row: 5, speakerKey: 's' })
    const subs = [
      fakeSub({ id: 'x', row: 9, speakerKey: 's' }),
      cur,
      fakeSub({ id: 'y', row: 2, speakerKey: 's' }),
      fakeSub({ id: 'r', row: 3, speakerKey: 's', removedFromSheet: true }),
      fakeSub({ id: 'o', row: 4, speakerKey: 'other' }),
    ]
    expect(otherTalks(subs, cur).map((s) => s.id)).toEqual(['y', 'x'])
  })
})
