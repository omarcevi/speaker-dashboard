import { describe, expect, it } from 'vitest'
import { logisticsRows, toCsv, type LogisticsRow } from './logistics.ts'
import { fakeReview, fakeSub } from './testing.ts'

const approved = (...ids: string[]) => new Map(ids.map((id) => [id, fakeReview('approved')]))

describe('logisticsRows', () => {
  it('gives one row per speaker, latest-row logistics, talks in row order', () => {
    const subs = [
      fakeSub({ id: 'b', row: 3, speakerKey: 's1', title: 'B', logistics: { ...fakeSub({ id: 'x', row: 1 }).logistics, tshirt: 'M' } }),
      fakeSub({ id: 'a', row: 2, speakerKey: 's1', title: 'A' }),
    ]
    const rows = logisticsRows(subs, approved('a', 'b'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'speaker', talks: 'A | B', tshirt: 'M' })
  })
  it('sorts Turkish names with the tr locale', () => {
    const subs = ['Deniz', 'Çelik', 'Cem'].map((n, i) => fakeSub({ id: n, row: i + 2, firstName: n, lastName: '' }))
    expect(logisticsRows(subs, approved('Deniz', 'Çelik', 'Cem')).map((r) => r.name)).toEqual(['Cem', 'Çelik', 'Deniz'])
  })
  it('gives no row for a speaker with only declined talks', () => {
    const subs = [fakeSub({ id: 'a', row: 2 })]
    expect(logisticsRows(subs, new Map([['a', fakeReview('declined')]]))).toEqual([])
  })
  it('adds a co-speaker row with empty logistics', () => {
    const coSpeaker = { firstName: 'Rishi', lastName: 'Kumar', email: 'r@example.com', phone: '1' } as never
    const rows = logisticsRows([fakeSub({ id: 'a', row: 2, coSpeaker })], approved('a'))
    expect(rows).toHaveLength(2)
    const co = rows.find((r) => r.kind === 'co-speaker')!
    expect(co).toMatchObject({ name: 'Rishi Kumar', email: 'r@example.com', talks: 'Talk a', tshirt: '' })
  })
  it('excludes approved removed talks', () => {
    const subs = [fakeSub({ id: 'a', row: 2, removedFromSheet: true })]
    expect(logisticsRows(subs, approved('a'))).toEqual([])
  })
  it('does not mutate input', () => {
    const subs = [fakeSub({ id: 'b', row: 3, speakerKey: 's' }), fakeSub({ id: 'a', row: 2, speakerKey: 's' })]
    const ids = subs.map((s) => s.id)
    logisticsRows(subs, approved('a', 'b'))
    expect(subs.map((s) => s.id)).toEqual(ids)
  })
})

describe('toCsv', () => {
  const row = (over: Partial<LogisticsRow> = {}): LogisticsRow => ({
    kind: 'speaker', name: 'Ada', email: 'a@x.com', phone: '', talks: 'T', fromAbroad: '', abroadFrom: '',
    outsideIstanbul: '', city: '', transport: '', accommodation: '', tour: '', afterParty: '', tshirt: '',
    otherRequirements: '', anythingElse: '', ...over,
  })
  it('starts with BOM, has header and 2 lines for 1 row', () => {
    const csv = toCsv([row()])
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(2)
  })
  it('quotes every field per RFC 4180', () => {
    const lines = toCsv([row()]).split('\r\n')
    expect(lines[0]).toBe('﻿"Type","Name","Email","Phone","Talks","From abroad","Coming from (abroad)","Outside Istanbul","City","Transport support","Accommodation support","Istanbul tour","After party","T-shirt","Other requirements","Anything else"')
    expect(toCsv([row({ city: 'Paris, France' })])).toContain('"Paris, France"')
    expect(toCsv([row({ city: 'say "hi"' })])).toContain('"say ""hi"""')
    expect(toCsv([row({ city: 'line1\nline2' })])).toContain('"line1\nline2"')
    expect(toCsv([row({ city: 'a;=1+1' })])).toContain(',"a;=1+1",')
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
