import { describe, expect, it } from 'vitest'
import type { AiDoc } from '../../../functions/src/model.ts'
import { buildCards } from './cards.ts'
import { overviewState } from './overview.ts'
import { fakeSub } from './testing.ts'

const overview = {
  talk: 't', speaker: 's',
  abstract: { value: 'Clear', why: 'w' }, community: { value: 'Yes', why: 'w' },
  speaking: { value: 'Experienced', why: 'w' }, student: { value: 'No', why: 'w' },
  model: 'm', generatedAt: { toMillis: () => 0 },
} as unknown as NonNullable<AiDoc['overview']>
const aiDoc = (over: Partial<AiDoc> = {}): AiDoc => ({ sourceHash: 'h1', overview, neighbors: [], error: null, ...over })
const card = (hash = 'h1') => buildCards([fakeSub({ id: 'a', row: 2, contentHash: hash })], () => false)[0]

describe('overviewState', () => {
  it('is missing without an ai doc for displayId', () => {
    expect(overviewState(card(), new Map()).kind).toBe('missing')
  })
  it('is missing for a placeholder with no overview, even if the hash differs', () => {
    expect(overviewState(card(), new Map([['a', aiDoc({ overview: null, sourceHash: '', error: 'x' })]])).kind).toBe('missing')
  })
  it('is updating when hashes differ', () => {
    expect(overviewState(card('h2'), new Map([['a', aiDoc()]])).kind).toBe('updating')
  })
  it('is ready when hashes match and overview exists', () => {
    expect(overviewState(card(), new Map([['a', aiDoc()]])).kind).toBe('ready')
  })
  it('uses displayId, not id, for merged cards', () => {
    const c = { ...card(), id: 'adv', displayId: 'form' }
    expect(overviewState(c, new Map([['adv', aiDoc({ sourceHash: 'zzz' })], ['form', aiDoc()]])).kind).toBe('ready')
    expect(overviewState(c, new Map([['adv', aiDoc()]])).kind).toBe('missing')
  })
})
