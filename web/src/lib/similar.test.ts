import { describe, expect, it } from 'vitest'
import type { AiDoc } from '../../../functions/src/model.ts'
import { buildCards } from './cards.ts'
import { CLOSE, VERY_SIMILAR, barWidth, similarFor, similarState } from './similar.ts'
import { fakeReview, fakeSub } from './testing.ts'

const aiDoc = (neighbors: { id: string; score: number }[]): AiDoc =>
  ({ sourceHash: 'h', overview: null, neighbors, error: null }) as AiDoc
const subs = [
  fakeSub({ id: 'me', row: 2, speakerKey: 'k1', title: 'Mine' }),
  fakeSub({ id: 'me-adv', row: 3, speakerKey: 'k1', title: 'Mine', source: 'advocu' }),
  fakeSub({ id: 'o1', row: 4, speakerKey: 'k2', title: 'Other' }),
  fakeSub({ id: 'o2', row: 5, speakerKey: 'k2', title: 'Other', source: 'advocu' }),
  fakeSub({ id: 'p', row: 6, speakerKey: 'k3', title: 'Peer' }),
  fakeSub({ id: 'gone', row: 7, speakerKey: 'k4', title: 'Gone', removedFromSheet: true }),
]
const cards = buildCards(subs, () => false)
const me = cards.find((c) => c.title === 'Mine')!
const run = (neighbors: { id: string; score: number }[], reviews = new Map<string, ReturnType<typeof fakeReview>>()) =>
  similarFor(me, cards, new Map([[me.displayId, aiDoc(neighbors)]]), reviews)

describe('similarFor', () => {
  it('similar dedupes by card and excludes own members', () => {
    const r = run([{ id: 'me-adv', score: 0.99 }, { id: 'o1', score: 0.8 }, { id: 'o2', score: 0.9 }])
    expect(r.top).toHaveLength(1)
    expect(r.top[0].card.title).toBe('Other')
    expect(r.top[0].score).toBe(0.9)
  })
  it('counts close cards and flags very similar approved ones', () => {
    const other = cards.find((c) => c.title === 'Other')!
    const r = run(
      [{ id: 'o1', score: VERY_SIMILAR + 0.01 }, { id: 'p', score: CLOSE + 0.01 }, { id: 'me-adv', score: 0.5 }],
      new Map([[other.id, fakeReview('approved')]]),
    )
    expect(r.closeCount).toBe(2)
    expect(r.approvedClose).toBe(1)
    expect(r.veryAlikeApproved.map((c) => c.title)).toEqual(['Other'])
  })
  it('capped when 30 neighbors all reach CLOSE', () => {
    const ns = Array.from({ length: 30 }, (_, i) => ({ id: i === 0 ? 'o1' : `x${i}`, score: 0.9 - i * 0.001 }))
    expect(run(ns).capped).toBe(true)
    expect(run(ns.slice(0, 29)).capped).toBe(false)
  })
  it('removed and unknown neighbors are ignored', () => {
    const r = run([{ id: 'gone', score: 0.9 }, { id: 'nope', score: 0.9 }])
    expect(r.top).toEqual([])
    expect(r.closeCount).toBe(0)
  })
  it('statuses are live', () => {
    const other = cards.find((c) => c.title === 'Other')!
    const ai = new Map([[me.displayId, aiDoc([{ id: 'o1', score: 0.9 }])]])
    expect(similarFor(me, cards, ai, new Map()).approvedClose).toBe(0)
    expect(similarFor(me, cards, ai, new Map([[other.id, fakeReview('approved')]])).approvedClose).toBe(1)
  })
})

describe('similarState', () => {
  const overview = {} as NonNullable<AiDoc['overview']>
  const n = [{ id: 'o1', score: 0.9 }]
  it('is hidden without an ai doc', () => {
    expect(similarState(undefined)).toBe('hidden')
  })
  it('is not ready for a placeholder with no overview, even with neighbours', () => {
    expect(similarState(aiDoc([]))).toBe('not-ready')
    expect(similarState(aiDoc(n))).toBe('not-ready')
  })
  it('is not ready for a new doc with an overview but no neighbours yet', () => {
    expect(similarState({ ...aiDoc([]), overview })).toBe('not-ready')
  })
  it('is ready with an overview and neighbours', () => {
    expect(similarState({ ...aiDoc(n), overview })).toBe('ready')
  })
})

describe('barWidth', () => {
  it('is the score as a percentage, clamped to 0..100', () => {
    expect(barWidth(0.834)).toBe(83)
    expect(barWidth(-0.2)).toBe(0)
    expect(barWidth(1.3)).toBe(100)
    expect(barWidth(Number.NaN)).toBe(0)
  })
})
