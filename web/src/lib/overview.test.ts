import { describe, expect, it } from 'vitest'
import type { AiDoc } from '../../../functions/src/model.ts'
import { buildCards } from './cards.ts'
import { overviewState, regenerateFailure } from './overview.ts'
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
    const placeholder = aiDoc({ overview: null, sourceHash: '', error: 'x' })
    const st = overviewState(card(), new Map([['a', placeholder]]))
    expect(st.kind).toBe('missing')
    expect(st.kind === 'missing' && st.doc).toBe(placeholder)
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

describe('overviewState for talks without an overview by design', () => {
  it('is hidden for a removed card, even with an ai doc', () => {
    const c = { ...card(), removedFromSheet: true }
    expect(overviewState(c, new Map([['a', aiDoc()]])).kind).toBe('hidden')
    expect(overviewState(c, new Map()).kind).toBe('hidden')
  })
  it('is hidden for a no-session card', () => {
    const c = { ...card(), noSession: true }
    expect(overviewState(c, new Map()).kind).toBe('hidden')
    expect(overviewState(c, new Map([['a', aiDoc()]])).kind).toBe('hidden')
  })
})

describe('regenerateFailure', () => {
  const err = (code: string, message: string) => Object.assign(new Error(message), { code })
  it('maps functions/internal to a plain message', () => {
    expect(regenerateFailure(err('functions/internal', 'internal'))).toBe('Could not regenerate this overview — try again later.')
  })
  it('maps functions/deadline-exceeded to a still-working message', () => {
    expect(regenerateFailure(err('functions/deadline-exceeded', 'deadline-exceeded')))
      .toBe("Still working — the overview will update when it's ready.")
  })
  it('shows the message for other errors, matching by code rather than message text', () => {
    expect(regenerateFailure(err('functions/not-found', 'No present submission with a title has that id.')))
      .toBe('No present submission with a title has that id.')
    expect(regenerateFailure(new Error('internal'))).toBe('internal')
    expect(regenerateFailure('boom')).toBe('boom')
  })
})
