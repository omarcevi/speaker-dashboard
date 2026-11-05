import { describe, expect, it } from 'vitest'
import type { Submission } from '../../../functions/src/model.ts'
import { buildCards, cardFor } from './cards.ts'
import { fakeAdvocuDetails, fakeSub } from './testing.ts'

const SPEAKER = 'ada@example.com'
const none = () => false
const only = (...ids: string[]) => (id: string) => ids.includes(id)

const form = (id: string, row: number, over: Partial<Submission> = {}) =>
  fakeSub({ id, row, speakerKey: SPEAKER, title: 'Building Agents', timestamp: '10/1/2026 10:00:00', ...over })
const advocu = (id: string, timestamp: string, over: Partial<Submission> = {}) =>
  fakeSub({
    id, row: 0, source: 'advocu', speakerKey: SPEAKER, title: 'Building agents!', timestamp,
    advocu: fakeAdvocuDetails({ creationDate: timestamp, sessionLength: `len-${id}` }), ...over,
  })

const formDoc = form('row-2', 2, { photoUrl: 'https://example.com/ada.jpg', abstract: 'Form abstract' })
const advocuDoc = advocu('advocu-a', '2026-10-05T09:30:00.000Z', { abstract: 'Advocu abstract' })

describe('buildCards', () => {
  it('merges a form and an advocu doc with the same speaker and title', () => {
    const cards = buildCards([advocuDoc, formDoc], none)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 'row-2', displayId: 'row-2', sources: ['form', 'advocu'], advocu: advocuDoc.advocu, possibleDuplicateOf: [],
      title: 'Building Agents', abstract: 'Form abstract', photoUrl: 'https://example.com/ada.jpg', removedFromSheet: false,
    })
    expect([...cards[0].memberIds].sort()).toEqual(['advocu-a', 'row-2'])
  })

  it('a reviewed present advocu primary shows its own content, not the newer form version', () => {
    const cards = buildCards([formDoc, advocuDoc], only('advocu-a'))
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 'advocu-a', displayId: 'advocu-a', sources: ['form', 'advocu'], advocu: advocuDoc.advocu,
      title: 'Building agents!', abstract: 'Advocu abstract', photoUrl: '',
    })
    expect([...cards[0].memberIds].sort()).toEqual(['advocu-a', 'row-2'])
  })

  it('a reviewed present form primary shows its own content, not a newer form row', () => {
    const newer = form('row-7', 7, { abstract: 'Unreviewed newer abstract' })
    const cards = buildCards([formDoc, newer], only('row-2'))
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ id: 'row-2', displayId: 'row-2', abstract: 'Form abstract' })
  })

  it('two reviewed docs stay separate and point at each other', () => {
    const cards = buildCards([formDoc, advocuDoc], only('row-2', 'advocu-a'))
    expect(cards).toHaveLength(2)
    expect(cardFor(cards, 'row-2')).toMatchObject({
      id: 'row-2', displayId: 'row-2', sources: ['form'], memberIds: ['row-2'], advocu: null, possibleDuplicateOf: ['advocu-a'],
    })
    expect(cardFor(cards, 'advocu-a')).toMatchObject({
      id: 'advocu-a', displayId: 'advocu-a', sources: ['advocu'], memberIds: ['advocu-a'], advocu: advocuDoc.advocu,
      abstract: 'Advocu abstract', possibleDuplicateOf: ['row-2'],
    })
  })

  it('a removed reviewed primary keeps its decision and shows the present form version', () => {
    const removedAdvocu = { ...advocuDoc, removedFromSheet: true }
    const cards = buildCards([removedAdvocu, formDoc], only('advocu-a'))
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 'advocu-a', displayId: 'row-2', removedFromSheet: false,
      title: 'Building Agents', abstract: 'Form abstract', photoUrl: 'https://example.com/ada.jpg',
    })
  })

  it('an unreviewed group picks its primary from present docs: a removed newer form row is skipped', () => {
    const removedLatest = form('row-7', 7, { abstract: 'Removed abstract', removedFromSheet: true })
    const cards = buildCards([advocuDoc, removedLatest, formDoc], none)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ id: 'row-2', displayId: 'row-2', removedFromSheet: false, abstract: 'Form abstract' })
  })

  it('split group: a present card does not list a removed reviewed member as a possible duplicate', () => {
    const removedAdvocu = { ...advocuDoc, removedFromSheet: true }
    const newer = form('row-7', 7, { abstract: 'Unreviewed newer abstract' })
    const cards = buildCards([formDoc, removedAdvocu, newer], only('row-2', 'advocu-a'))
    expect(cards).toHaveLength(3)
    expect(cardFor(cards, 'row-2')?.possibleDuplicateOf).toEqual(['row-7'])
    expect(cardFor(cards, 'row-7')?.possibleDuplicateOf).toEqual(['row-2'])
    expect(cardFor(cards, 'advocu-a')?.possibleDuplicateOf).toEqual(['row-2', 'row-7'])
  })

  it('advocu details come from the latest present advocu doc when the primary is a form doc', () => {
    const presentOlder = advocu('advocu-c', '2026-10-03T08:00:00.000Z')
    const removedNewer = advocu('advocu-b', '2026-10-09T08:00:00.000Z', { removedFromSheet: true })
    const cards = buildCards([formDoc, removedNewer, presentOlder], none)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ id: 'row-2', advocu: presentOlder.advocu })
  })

  it('a group with every member removed is one removed card', () => {
    const cards = buildCards([{ ...formDoc, removedFromSheet: true }, { ...advocuDoc, removedFromSheet: true }], none)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ id: 'row-2', displayId: 'row-2', removedFromSheet: true })
  })

  it('an all-removed advocu-only group uses the latest advocu doc', () => {
    const later = advocu('advocu-b', '2026-10-09T08:00:00.000Z', { removedFromSheet: true })
    const earlier = advocu('advocu-c', '2026-10-03T08:00:00.000Z', { removedFromSheet: true })
    const cards = buildCards([earlier, later], none)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ id: 'advocu-b', displayId: 'advocu-b', removedFromSheet: true, advocu: later.advocu })
  })

  it('different titles stay separate', () => {
    const other = advocu('advocu-k', '2026-10-05T09:30:00.000Z', { title: 'Kotlin Compose' })
    expect(buildCards([formDoc, other], none).map((c) => c.id).sort()).toEqual(['advocu-k', 'row-2'])
  })

  it('empty titles are never grouped', () => {
    const subs = [form('row-3', 3, { title: '', noSession: true }), form('row-4', 4, { title: '', noSession: true })]
    expect(buildCards(subs, none).map((c) => c.id).sort()).toEqual(['row-3', 'row-4'])
  })

  it('two form rows with the same title fold into the latest', () => {
    const subs = [form('row-7', 7, { abstract: 'Newer' }), form('row-2', 2, { abstract: 'Older' })]
    const cards = buildCards(subs, none)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ id: 'row-7', abstract: 'Newer', sources: ['form'], advocu: null })
    expect([...cards[0].memberIds].sort()).toEqual(['row-2', 'row-7'])
  })

  const later = advocu('advocu-b', '2026-10-09T08:00:00.000Z', { abstract: 'Later' })
  const earlier = advocu('advocu-c', '2026-10-03T08:00:00.000Z', { abstract: 'Earlier' })

  it('no-review advocu-only group uses the latest advocu doc', () => {
    const cards = buildCards([earlier, later], none)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 'advocu-b', displayId: 'advocu-b', abstract: 'Later', sources: ['advocu'], advocu: later.advocu,
    })
  })

  it('scoring an unreviewed card does not change its content', () => {
    const before = buildCards([earlier, later], none)[0]
    const after = buildCards([earlier, later], only(before.id))[0]
    expect(after).toEqual(before)
  })

  it('cardFor finds a card by member id', () => {
    const cards = buildCards([formDoc, advocuDoc], none)
    expect(cardFor(cards, 'advocu-a')?.id).toBe('row-2')
    expect(cardFor(cards, 'row-2')?.id).toBe('row-2')
    expect(cardFor(cards, 'row-99')).toBeUndefined()
  })
})
