import { describe, expect, it } from 'vitest'
import { statusOf } from './status.ts'
import { fakeReview } from './testing.ts'

describe('statusOf', () => {
  it('defaults to pending', () => {
    expect(statusOf(new Map(), 'a')).toBe('pending')
    expect(statusOf(new Map([['a', fakeReview('maybe')]]), 'a')).toBe('maybe')
  })
})
