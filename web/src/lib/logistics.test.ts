import { describe, expect, it } from 'vitest'
import { logisticsRows, toCsv, type LogisticsRow } from './logistics.ts'
import { buildCards } from './cards.ts'
import { fakeReview, fakeSub } from './testing.ts'
import type { Review, Submission } from '../../../functions/src/model.ts'

const rowsFor = (subs: Submission[], reviews: Map<string, Review>) =>
  logisticsRows(buildCards(subs, (id) => reviews.has(id)), subs, reviews)

const approved = (...ids: string[]) => new Map(ids.map((id) => [id, fakeReview('approved')]))

describe('logisticsRows', () => {
  it('gives one row per speaker, latest-row logistics, talks in row order', () => {
    const subs = [
      fakeSub({ id: 'b', row: 3, speakerKey: 's1', title: 'B', logistics: { ...fakeSub({ id: 'x', row: 1 }).logistics, tshirt: 'M' } }),
      fakeSub({ id: 'a', row: 2, speakerKey: 's1', title: 'A' }),
    ]
    const rows = rowsFor(subs, approved('a', 'b'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'speaker', talks: 'A | B', tshirt: 'M' })
  })
  it('sorts Turkish names with the tr locale', () => {
    const subs = ['Deniz', 'Çelik', 'Cem'].map((n, i) => fakeSub({ id: n, row: i + 2, firstName: n, lastName: '' }))
    expect(rowsFor(subs, approved('Deniz', 'Çelik', 'Cem')).map((r) => r.name)).toEqual(['Cem', 'Çelik', 'Deniz'])
  })
  it('gives no row for a speaker with only declined talks', () => {
    const subs = [fakeSub({ id: 'a', row: 2 })]
    expect(rowsFor(subs, new Map([['a', fakeReview('declined')]]))).toEqual([])
  })
  it('adds a co-speaker row with empty logistics', () => {
    const coSpeaker = { firstName: 'Rishi', lastName: 'Kumar', email: 'r@example.com', phone: '1' } as never
    const rows = rowsFor([fakeSub({ id: 'a', row: 2, coSpeaker })], approved('a'))
    expect(rows).toHaveLength(2)
    const co = rows.find((r) => r.kind === 'co-speaker')!
    expect(co).toMatchObject({ name: 'Rishi Kumar', email: 'r@example.com', talks: 'Talk a', tshirt: '' })
  })
  it('excludes approved removed talks', () => {
    const subs = [fakeSub({ id: 'a', row: 2, removedFromSheet: true })]
    expect(rowsFor(subs, approved('a'))).toEqual([])
  })
  const L = (tshirt: string) => ({ ...fakeSub({ id: 'x', row: 1 }).logistics, tshirt })
  it('a spoofed pending form doc does not change the approved speaker’s name or phone', () => {
    const subs = [
      fakeSub({ id: 'adv', row: 0, speakerKey: 's1', source: 'advocu', firstName: 'Ada', phone: '111' }),
      fakeSub({ id: 'frm', row: 5, speakerKey: 's1', title: 'Other', firstName: 'Mallory', phone: '999' }),
    ]
    expect(rowsFor(subs, approved('adv'))[0]).toMatchObject({ name: 'Ada Lovelace', phone: '111' })
  })
  it('uses a pending form doc’s logistics and marks them unreviewed', () => {
    const subs = [
      fakeSub({ id: 'adv', row: 0, speakerKey: 's1', source: 'advocu' }),
      fakeSub({ id: 'frm', row: 5, speakerKey: 's1', title: 'Other', logistics: L('L') }),
    ]
    expect(rowsFor(subs, approved('adv'))[0]).toMatchObject({ tshirt: 'L', formAnswers: 'unreviewed' })
  })
  it('prefers an approved form doc’s logistics over a newer pending one', () => {
    const subs = [
      fakeSub({ id: 'a', row: 2, speakerKey: 's1', logistics: L('M') }),
      fakeSub({ id: 'p', row: 9, speakerKey: 's1', title: 'Newer', logistics: L('XL') }),
    ]
    expect(rowsFor(subs, approved('a'))[0]).toMatchObject({ tshirt: 'M', formAnswers: 'yes' })
  })
  it('a spoofed form doc merged hidden into an approved card is not used', () => {
    const subs = [
      fakeSub({ id: 'f3', row: 3, speakerKey: 's1', title: 'Same', logistics: L('M') }),
      fakeSub({ id: 'f9', row: 9, speakerKey: 's1', title: 'Same', logistics: L('XXL') }),
    ]
    expect(rowsFor(subs, approved('f3'))[0]).toMatchObject({ tshirt: 'M', formAnswers: 'yes' })
  })
  it('a form doc merged hidden into an advocu-primary approved card is unreviewed', () => {
    const subs = [
      fakeSub({ id: 'adv', row: 0, speakerKey: 's1', source: 'advocu', title: 'Same' }),
      fakeSub({ id: 'f9', row: 9, speakerKey: 's1', title: 'Same', logistics: L('XXL') }),
    ]
    expect(rowsFor(subs, approved('adv'))[0]).toMatchObject({ tshirt: 'XXL', formAnswers: 'unreviewed' })
  })
  it('ignores declined form docs', () => {
    const subs = [
      fakeSub({ id: 'adv', row: 0, speakerKey: 's1', source: 'advocu' }),
      fakeSub({ id: 'd', row: 5, speakerKey: 's1', title: 'No', logistics: L('S') }),
    ]
    const reviews = new Map([...approved('adv'), ['d', fakeReview('declined')] as const])
    expect(rowsFor(subs, reviews)[0]).toMatchObject({ tshirt: '', formAnswers: 'no' })
  })
  it('approved advocu-only speaker gets a row with empty logistics and formAnswers no', () => {
    const subs = [fakeSub({ id: 'adv', row: 0, source: 'advocu' })]
    const rows = rowsFor(subs, approved('adv'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'speaker', formAnswers: 'no', tshirt: '', city: '', email: 'adv@example.com' })
  })
  it('ignores removed form submissions for logistics', () => {
    const subs = [
      fakeSub({ id: 'adv', row: 0, speakerKey: 's1', source: 'advocu' }),
      fakeSub({ id: 'frm', row: 5, speakerKey: 's1', title: 'Gone', removedFromSheet: true }),
    ]
    expect(rowsFor(subs, approved('adv'))[0].formAnswers).toBe('no')
  })
  it('a merged card counts once in talks', () => {
    const subs = [
      fakeSub({ id: 'f', row: 2, speakerKey: 's1', title: 'Same' }),
      fakeSub({ id: 'adv', row: 0, speakerKey: 's1', title: 'Same', source: 'advocu' }),
    ]
    const rows = rowsFor(subs, approved('f'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ talks: 'Same', formAnswers: 'yes' })
  })
  it('co-speaker rows have formAnswers null', () => {
    const coSpeaker = { firstName: 'R', lastName: 'K', email: 'r@example.com', phone: '1' } as never
    const co = rowsFor([fakeSub({ id: 'a', row: 2, coSpeaker })], approved('a')).find((r) => r.kind === 'co-speaker')!
    expect(co.formAnswers).toBeNull()
  })
  it('does not mutate input', () => {
    const subs = [fakeSub({ id: 'b', row: 3, speakerKey: 's' }), fakeSub({ id: 'a', row: 2, speakerKey: 's' })]
    const ids = subs.map((s) => s.id)
    rowsFor(subs, approved('a', 'b'))
    expect(subs.map((s) => s.id)).toEqual(ids)
  })
})

describe('toCsv', () => {
  const row = (over: Partial<LogisticsRow> = {}): LogisticsRow => ({
    kind: 'speaker', name: 'Ada', email: 'a@x.com', phone: '', talks: 'T', fromAbroad: '', abroadFrom: '',
    outsideIstanbul: '', city: '', transport: '', accommodation: '', tour: '', afterParty: '', tshirt: '',
    otherRequirements: '', anythingElse: '', formAnswers: 'yes', ...over,
  })
  it('starts with BOM, has header and 2 lines for 1 row', () => {
    const csv = toCsv([row()])
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(2)
  })
  it('quotes every field per RFC 4180', () => {
    const lines = toCsv([row()]).split('\r\n')
    expect(lines[0]).toBe('﻿"Type","Name","Email","Phone","Talks","Form answers","From abroad","Coming from (abroad)","Outside Istanbul","City","Transport support","Accommodation support","Istanbul tour","After party","T-shirt","Other requirements","Anything else"')
    expect(toCsv([row({ city: 'Paris, France' })])).toContain('"Paris, France"')
    expect(toCsv([row({ city: 'say "hi"' })])).toContain('"say ""hi"""')
    expect(toCsv([row({ city: 'line1\nline2' })])).toContain('"line1\nline2"')
    expect(toCsv([row({ city: 'a;=1+1' })])).toContain(`,"a;'=1+1",`)
    expect(toCsv([row({ city: 'x;\t @y' })])).toContain(`,"x;\t '@y",`)
    expect(toCsv([row({ city: 'Python; Go' })])).toContain(',"Python; Go",')
  })
  it('writes Yes, No or empty in the Form answers column', () => {
    expect(toCsv([row({ formAnswers: 'yes' })]).split('\r\n')[1]).toContain('"T","Yes",')
    expect(toCsv([row({ formAnswers: 'unreviewed' })]).split('\r\n')[1]).toContain('"T","Unreviewed",')
    expect(toCsv([row({ formAnswers: 'no' })]).split('\r\n')[1]).toContain('"T","No",')
    expect(toCsv([row({ formAnswers: null })]).split('\r\n')[1]).toContain('"T","",')
  })
  it('keeps Turkish characters', () => {
    const csv = toCsv([row({ city: 'Türkiye', abroadFrom: 'İstanbul' })])
    expect(csv).toContain('Türkiye')
    expect(csv).toContain('İstanbul')
  })
  it('neutralises formula injection outside the phone column', () => {
    expect(toCsv([row({ city: '=HYPERLINK("http://x")' })])).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(toCsv([row({ city: '@x' })])).toContain(`,"'@x",`)
    expect(toCsv([row({ city: '-1+1' })])).toContain(`,"'-1+1",`)
    expect(toCsv([row({ city: '+1-2' })])).toContain(`,"'+1-2",`)
    expect(toCsv([row({ city: '\tx' })])).toContain(`,"'\tx",`)
  })
  it('keeps real phone numbers in the phone column only', () => {
    expect(toCsv([row({ phone: '+90 555 000 0000' })])).toContain(',"+90 555 000 0000",')
    expect(toCsv([row({ phone: '=1+1' })])).toContain(`,"'=1+1",`)
  })
})
