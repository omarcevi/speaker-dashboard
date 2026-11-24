import { describe, it, expect } from 'vitest'
import { autoClears, mayWithdraw, wantsDraft, topLabel, currentFor, isSettled, clearedByAi } from '../src/shared/replyAi.js'
import type { ThreadDoc, Ts } from '../src/model.js'

const P = (o: Partial<Record<'needs_answer' | 'no_answer_needed' | 'withdrawing' | 'unclear', number>>) =>
  ({ needs_answer: 0, no_answer_needed: 0, withdrawing: 0, unclear: 0, ...o })
const at = {} as Ts
const th = (o: Partial<ThreadDoc>) => o as ThreadDoc
const settled = (messageId: string, by: string) => ({ messageId, by, byName: 'n', at })

describe('autoClears', () => {
  it('true at .95, false at .949 or when withdrawing >= .10', () => {
    expect(autoClears(P({ no_answer_needed: 0.95, needs_answer: 0.03, withdrawing: 0.01, unclear: 0.01 }))).toBe(true)
    expect(autoClears(P({ no_answer_needed: 0.949, needs_answer: 0.03, withdrawing: 0.01, unclear: 0.01 }))).toBe(false)
    expect(autoClears(P({ no_answer_needed: 0.96, withdrawing: 0.10 }))).toBe(false)
  })
})
describe('mayWithdraw', () => {
  it('threshold .30', () => {
    expect(mayWithdraw(P({ withdrawing: 0.3 }))).toBe(true)
    expect(mayWithdraw(P({ withdrawing: 0.29 }))).toBe(false)
  })
})
describe('topLabel', () => {
  it('breaks ties in label order', () => {
    expect(topLabel(P({ needs_answer: 0.5, unclear: 0.5 }))).toBe('needs_answer')
  })
})
describe('wantsDraft', () => {
  it('needs_answer and unclear want drafts', () => {
    expect(wantsDraft(P({ needs_answer: 0.8, no_answer_needed: 0.2 }))).toBe(true)
    expect(wantsDraft(P({ unclear: 0.7, no_answer_needed: 0.3 }))).toBe(true)
  })
  it('not for withdrawing or no_answer_needed at .90', () => {
    expect(wantsDraft(P({ withdrawing: 0.8, needs_answer: 0.2 }))).toBe(false)
    expect(wantsDraft(P({ no_answer_needed: 0.9, needs_answer: 0.1 }))).toBe(false)
  })
})
describe('currentFor', () => {
  it('matches lastReplyId only', () => {
    expect(currentFor({ lastReplyId: 'm2' }, { messageId: 'm1' })).toBeNull()
    const v = { messageId: 'm2' }
    expect(currentFor({ lastReplyId: 'm2' }, v)).toBe(v)
    expect(currentFor({}, v)).toBeNull()
    expect(currentFor(undefined, v)).toBeNull()
    expect(currentFor({ lastReplyId: 'm2' }, null)).toBeNull()
  })
})
describe('isSettled / clearedByAi', () => {
  it('ai', () => {
    const t = th({ lastReplyId: 'm1', settled: settled('m1', 'ai') })
    expect(isSettled(t)).toBe(true); expect(clearedByAi(t)).toBe(true)
  })
  it('human', () => {
    const t = th({ lastReplyId: 'm1', settled: settled('m1', 'uid1') })
    expect(isSettled(t)).toBe(true); expect(clearedByAi(t)).toBe(false)
  })
  it('stale', () => {
    const t = th({ lastReplyId: 'm2', settled: settled('m1', 'ai') })
    expect(isSettled(t)).toBe(false); expect(clearedByAi(t)).toBe(false)
  })
  it('null, missing, undefined', () => {
    expect(isSettled(th({ lastReplyId: 'm1', settled: null }))).toBe(false)
    expect(clearedByAi(th({ lastReplyId: 'm1', settled: null }))).toBe(false)
    expect(isSettled(th({ lastReplyId: 'm1' }))).toBe(false)
    expect(isSettled(undefined)).toBe(false)
  })
})
