import { describe, expect, it } from 'vitest'
import { approvedBalance } from './balance.ts'
import { fakeReview, fakeSub } from './testing.ts'

describe('approvedBalance', () => {
  it('counts approved talks only', () => {
    const subs = [
      fakeSub({ id: 'a', row: 2, topicGroup: 'GenAI' }),
      fakeSub({ id: 'b', row: 3, topicGroup: 'GenAI' }),
      fakeSub({ id: 'c', row: 4, topicGroup: 'GenAI' }),
    ]
    const reviews = new Map([['a', fakeReview('approved')], ['b', fakeReview('approved')], ['c', fakeReview('declined')]])
    expect(approvedBalance(subs, reviews).topic).toEqual([{ label: 'GenAI', n: 2 }])
  })
  it('ignores removed and noSession talks', () => {
    const subs = [
      fakeSub({ id: 'a', row: 2, removedFromSheet: true }),
      fakeSub({ id: 'b', row: 3, noSession: true }),
      fakeSub({ id: 'c', row: 4 }),
    ]
    const reviews = new Map(['a', 'b', 'c'].map((id) => [id, fakeReview('approved')] as const))
    expect(approvedBalance(subs, reviews).topic).toEqual([{ label: 'Web', n: 1 }])
  })
  it('counts Other under Other and sorts by n desc then label', () => {
    const subs = [
      fakeSub({ id: 'a', row: 2, topicGroup: 'Other', language: 'Turkish', level: 'Advanced' }),
      fakeSub({ id: 'b', row: 3, topicGroup: 'Web', language: 'English' }),
      fakeSub({ id: 'c', row: 4, topicGroup: 'Web', language: 'English' }),
      fakeSub({ id: 'd', row: 5, topicGroup: 'Cloud', language: 'English' }),
    ]
    const reviews = new Map(['a', 'b', 'c', 'd'].map((id) => [id, fakeReview('approved')] as const))
    const b = approvedBalance(subs, reviews)
    expect(b.topic).toEqual([{ label: 'Web', n: 2 }, { label: 'Cloud', n: 1 }, { label: 'Other', n: 1 }])
    expect(b.language).toEqual([{ label: 'English', n: 3 }, { label: 'Turkish', n: 1 }])
  })
})
