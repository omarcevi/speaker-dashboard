import { describe, expect, it } from 'vitest'
import { applyFilter, buildRows, readQuery, searchKey, sortRows, writeQuery, type ListFilter, type ListRow } from './listView.ts'
import { fakeReview, fakeScore, fakeSub } from './testing.ts'

const defaults: ListFilter = { status: 'all', topic: null, level: null, language: null, q: '', showRemoved: false }

const subs = [
  fakeSub({ id: 'a', row: 2, speakerKey: 'k1', topicGroup: 'Web', lastName: 'KAPICI' }),
  fakeSub({ id: 'b', row: 3, speakerKey: 'k1', topicGroup: 'Cloud', company: 'İzmir Yazılım' }),
  fakeSub({ id: 'c', row: 4, speakerKey: 'k2' }),
  fakeSub({ id: 'd', row: 5, speakerKey: 'k1', removedFromSheet: true }),
]
const reviews = new Map([['b', fakeReview('approved')]])
const scores = new Map([
  ['a', [fakeScore('a', 'me', 'Me', 5), fakeScore('a', 'o', 'O', 1)]],
  ['b', [fakeScore('b', 'me', 'Me', 3), fakeScore('b', 'o', 'O', 5)]],
  ['c', [fakeScore('c', 'o', 'O', 5)]],
])
const comments = new Map([['a', [{}, {}]]])
const rows = buildRows(subs, reviews, scores, comments, 'me', false)
const ids = (r: ListRow[]) => r.map((x) => x.sub.id)

describe('buildRows', () => {
  it('computes status, comments and other-talk counts', () => {
    expect(rows[0]).toMatchObject({ status: 'pending', commentCount: 2, otherTalkCount: 1 })
    expect(rows[1].status).toBe('approved')
    expect(rows[2].otherTalkCount).toBe(0)
  })
})

describe('sortRows', () => {
  it('score: revealed by avg desc, then unrevealed by row', () => {
    const s = sortRows(rows, 'score')
    expect(ids(s)).toEqual(['b', 'a', 'c', 'd'])
  })
  it('spread: max-min desc, unrevealed last', () => {
    expect(ids(sortRows(rows, 'spread'))).toEqual(['a', 'b', 'c', 'd'])
  })
  it('date: row ascending, no mutation', () => {
    const shuffled = [rows[2], rows[0], rows[1]]
    expect(ids(sortRows(shuffled, 'date'))).toEqual(['a', 'b', 'c'])
    expect(ids(shuffled)).toEqual(['c', 'a', 'b'])
  })
})

describe('applyFilter', () => {
  it('pending includes subs with no review', () => {
    expect(ids(applyFilter(rows, { ...defaults, status: 'pending' }))).toEqual(['a', 'c'])
  })
  it('hides removed unless showRemoved', () => {
    expect(ids(applyFilter(rows, defaults))).toEqual(['a', 'b', 'c'])
    expect(ids(applyFilter(rows, { ...defaults, showRemoved: true }))).toContain('d')
  })
  it('filters by topic', () => {
    expect(ids(applyFilter(rows, { ...defaults, topic: 'Cloud' }))).toEqual(['b'])
  })
  it('search is case and diacritic insensitive', () => {
    expect(ids(applyFilter(rows, { ...defaults, q: 'kapici' }))).toEqual(['a'])
    expect(ids(applyFilter(rows, { ...defaults, q: 'izmir' }))).toEqual(['b'])
  })
})

describe('searchKey', () => {
  it('folds Turkish characters', () => {
    expect(searchKey('KAPICI')).toBe('kapici')
    expect(searchKey('İzmir Yazılım')).toBe('izmir yazilim')
  })
})

describe('query round trip', () => {
  it('omits defaults', () => {
    expect(writeQuery(defaults, 'date').toString()).toBe('')
  })
  it('round-trips a non-default filter', () => {
    const f: ListFilter = { status: 'maybe', topic: 'Web', level: 'Beginner', language: 'English', q: 'ada', showRemoved: true }
    expect(readQuery(writeQuery(f, 'score'))).toEqual({ filter: f, sort: 'score' })
  })
  it('reads defaults from empty and ignores junk', () => {
    expect(readQuery(new URLSearchParams('status=bogus&sort=nope'))).toEqual({ filter: defaults, sort: 'date' })
  })
})
