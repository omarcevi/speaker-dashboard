import { describe, expect, it } from 'vitest'
import { statusCounts, statusOf } from './status.ts'
import { fakeReview, fakeSub } from './testing.ts'

describe('statusOf', () => {
  it('defaults to pending', () => {
    expect(statusOf(new Map(), 'a')).toBe('pending')
    expect(statusOf(new Map([['a', fakeReview('maybe')]]), 'a')).toBe('maybe')
  })
})

describe('statusCounts', () => {
  const subs = [
    fakeSub({ id: 'a', row: 2 }),
    fakeSub({ id: 'b', row: 3 }),
    fakeSub({ id: 'c', row: 4 }),
    fakeSub({ id: 'd', row: 5, removedFromSheet: true }),
  ]
  const reviews = new Map([['b', fakeReview('approved')], ['d', fakeReview('approved')]])

  it('counts a sub with no review as pending', () => {
    expect(statusCounts(subs, reviews)).toMatchObject({ pending: 2, approved: 1 })
  })
  it('excludes removed subs from every count including all', () => {
    expect(statusCounts(subs, reviews)).toEqual({ all: 3, pending: 2, maybe: 0, approved: 1, declined: 0 })
  })
})
