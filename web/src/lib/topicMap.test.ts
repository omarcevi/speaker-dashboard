import { describe, expect, it } from 'vitest'
import type { AiMeta, TopicMap } from '../../../functions/src/model.ts'
import { buildCards } from './cards.ts'
import { fakeReview, fakeSub } from './testing.ts'
import { aiStatusNotes, mapView } from './topicMap.ts'

const map = (points: TopicMap['points']): TopicMap => ({
  points, clusters: [{ id: 0, label: 'Web' }, { id: 1, label: 'AI' }], generatedAt: null, error: null,
})

describe('mapView', () => {
  it('one dot per card even when two members have points', () => {
    const cards = buildCards([
      fakeSub({ id: 'f', row: 2, speakerKey: 'k', title: 'T' }),
      fakeSub({ id: 'a', row: 3, speakerKey: 'k', title: 'T', source: 'advocu' }),
    ], () => false)
    const v = mapView(map([{ id: 'f', x: 0.1, y: 0.2, cluster: 0 }, { id: 'a', x: 0.9, y: 0.9, cluster: 0 }]), cards, new Map())
    expect(v.dots).toHaveLength(1)
    expect(v.dots[0]).toMatchObject({ x: 0.1, y: 0.2 })
  })
  it('falls back to a member point when displayId has none', () => {
    const cards = buildCards([
      fakeSub({ id: 'f', row: 2, speakerKey: 'k', title: 'T' }),
      fakeSub({ id: 'a', row: 3, speakerKey: 'k', title: 'T', source: 'advocu' }),
    ], () => false)
    const v = mapView(map([{ id: 'a', x: 0.5, y: 0.5, cluster: 1 }]), cards, new Map())
    expect(v.dots).toHaveLength(1)
    expect(v.dots[0]).toMatchObject({ x: 0.5, y: 0.5, cluster: 1 })
  })
  it('cluster counts are per card and live status comes from reviews', () => {
    const cards = buildCards([
      fakeSub({ id: 'a', row: 2 }), fakeSub({ id: 'b', row: 3 }), fakeSub({ id: 'c', row: 4 }),
    ], () => false)
    const v = mapView(map([
      { id: 'a', x: 0.2, y: 0.2, cluster: 0 }, { id: 'b', x: 0.4, y: 0.2, cluster: 0 }, { id: 'c', x: 0.8, y: 0.8, cluster: 1 },
    ]), cards, new Map([['b', fakeReview('approved')]]))
    const web = v.clusters.find((c) => c.id === 0)!
    expect(web).toMatchObject({ label: 'Web', count: 2 })
    expect(web.cx).toBeCloseTo(0.3)
    expect(web.cy).toBeCloseTo(0.2)
    expect(v.clusters.find((c) => c.id === 0)!.r).toBeGreaterThanOrEqual(0.1)
    expect(v.clusters.find((c) => c.id === 1)!.count).toBe(1)
    expect(v.dots.find((d) => d.card.id === 'b')!.status).toBe('approved')
    expect(v.dots.find((d) => d.card.id === 'a')!.status).toBe('pending')
  })
  it('removed cards are not drawn', () => {
    const cards = buildCards([fakeSub({ id: 'a', row: 2 }), fakeSub({ id: 'g', row: 3, removedFromSheet: true })], () => false)
    const v = mapView(map([{ id: 'a', x: 0.2, y: 0.2, cluster: 0 }, { id: 'g', x: 0.6, y: 0.6, cluster: 0 }]), cards, new Map())
    expect(v.dots.map((d) => d.card.id)).toEqual(['a'])
    expect(v.clusters.find((c) => c.id === 0)!.count).toBe(1)
  })
  it('a single-dot cluster has a positive radius', () => {
    const v = mapView(map([{ id: 'a', x: 0.2, y: 0.2, cluster: 0 }]), buildCards([fakeSub({ id: 'a', row: 2 })], () => false), new Map())
    expect(v.clusters[0].r).toBeGreaterThan(0)
  })
  it('a card with no point gets no dot, and a cluster with no dots is left out', () => {
    const cards = buildCards([fakeSub({ id: 'a', row: 2 }), fakeSub({ id: 'b', row: 3 })], () => false)
    const v = mapView(map([{ id: 'a', x: 0.2, y: 0.2, cluster: 0 }]), cards, new Map())
    expect(v.dots.map((d) => d.card.id)).toEqual(['a'])
    expect(v.clusters.map((c) => c.id)).toEqual([0])
  })
})

describe('aiStatusNotes', () => {
  const meta = (o: Partial<AiMeta> = {}): AiMeta => ({ lastRunAt: null, generated: 0, pending: 0, error: null, ...o })
  const withError = (error: string | null) => ({ ...map([]), error })
  it('says nothing when everything is fine or nothing has run yet', () => {
    expect(aiStatusNotes(meta(), withError(null))).toEqual([])
    expect(aiStatusNotes(null, null)).toEqual([])
  })
  it('shows the pending count', () => {
    expect(aiStatusNotes(meta({ pending: 7 }), withError(null))).toEqual(['Overviews pending: 7'])
  })
  it('shows a fixed problem text, never the stored error', () => {
    const secret = 'invalid model output: overview failed validation'
    const one = aiStatusNotes(meta({ error: secret }), withError(null))
    expect(one).toEqual(['Last AI run problem: some overviews could not be generated.'])
    expect(aiStatusNotes(meta(), withError(secret))).toEqual(['Last AI run problem: the topic names could not be generated.'])
    const both = aiStatusNotes(meta({ pending: 2, error: secret }), withError(secret))
    expect(both).toEqual([
      'Overviews pending: 2',
      'Last AI run problem: some overviews could not be generated; the topic names could not be generated.',
    ])
    expect(both.join(' ')).not.toContain(secret)
  })
})
