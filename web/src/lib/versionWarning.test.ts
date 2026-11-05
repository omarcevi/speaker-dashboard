import { describe, expect, it } from 'vitest'
import { buildCards } from './cards.ts'
import { versionWarning } from './versionWarning.ts'
import { fakeSub } from './testing.ts'

describe('versionWarning', () => {
  it('is null when the card shows the reviewed document', () => {
    expect(versionWarning(buildCards([fakeSub({ id: 'a', row: 2 })], () => false)[0])).toBeNull()
  })
  it('names the Form or Advocu version being shown', () => {
    const base = { speakerKey: 's', title: 'T' }
    const formDisplay = buildCards([
      fakeSub({ id: 'adv', row: 0, source: 'advocu', removedFromSheet: true, ...base }),
      fakeSub({ id: 'f', row: 2, ...base }),
    ], (id) => id === 'adv')[0]
    expect(versionWarning(formDisplay)).toBe('Showing a different Form version than the one reviewed')
    const advDisplay = buildCards([
      fakeSub({ id: 'f', row: 2, removedFromSheet: true, ...base }),
      fakeSub({ id: 'adv', row: 0, source: 'advocu', ...base }),
    ], (id) => id === 'f')[0]
    expect(versionWarning(advDisplay)).toBe('Showing a different Advocu version than the one reviewed')
  })
})
