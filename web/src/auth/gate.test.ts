import { expect, it } from 'vitest'
import { gate } from './gate.ts'

it.each([
  ['loading', null, 'loading'],
  ['signedOut', null, 'signin'],
  ['signedIn', null, 'loading'],
  ['signedIn', 'waiting', 'waiting'],
  ['signedIn', 'removed', 'removed'],
  ['signedIn', 'member', 'app'],
  ['signedIn', 'admin', 'app'],
] as const)('gate(%s, %s) -> %s', (auth, role, expected) => {
  expect(gate(auth, role)).toBe(expected)
})
