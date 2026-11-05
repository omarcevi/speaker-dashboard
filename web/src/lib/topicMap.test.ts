import { describe, expect, it } from 'vitest'
import type { TopicMap } from '../../../functions/src/model.ts'
import { buildCards } from './cards.ts'
import { fakeReview, fakeSub } from './testing.ts'
import { mapView } from './topicMap.ts'

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
})
