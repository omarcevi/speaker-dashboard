import { describe, expect, it } from 'vitest'
import { neighbors } from './sequence.ts'

const order = ['a', 'b', 'c', 'd', 'e']
const pass = (...ids: string[]) => (id: string) => ids.includes(id)

describe('neighbors', () => {
  it('finds prev/next among passing ids', () => {
    expect(neighbors(order, pass('a', 'c', 'e'), 'c')).toEqual({ prev: 'a', next: 'e', position: 2, total: 3 })
  })
  it('keeps neighbours when the current talk stops passing the filter', () => {
    expect(neighbors(order, pass('a', 'e'), 'c')).toEqual({ prev: 'a', next: 'e', position: null, total: 2 })
  })
  it('has no next at the end', () => {
    expect(neighbors(order, () => true, 'e').next).toBeNull()
  })
  it('has no prev at the start', () => {
    expect(neighbors(order, () => true, 'a').prev).toBeNull()
  })
  it('handles an id missing from the order', () => {
    expect(neighbors(order, () => true, 'z')).toMatchObject({ prev: null, next: 'a', position: null })
  })
})
