import { describe, expect, it } from 'vitest'
import { initials } from './initials.ts'

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Elif Kaya')).toBe('EK')
    expect(initials('  Omar  E. ')).toBe('OE')
  })
  it('uppercases Turkish letters correctly', () => {
    expect(initials('ipek duman')).toBe('İD')
  })
  it('handles a single name and an empty one', () => {
    expect(initials('Cher')).toBe('C')
    expect(initials('')).toBe('')
  })
})
