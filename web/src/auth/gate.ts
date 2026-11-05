import type { Role } from '../../../functions/src/model.ts'

export type AuthState = 'loading' | 'signedOut' | 'signedIn'
export type GateResult = 'loading' | 'signin' | 'waiting' | 'removed' | 'app'

export function gate(auth: AuthState, role: Role | null): GateResult {
  if (auth === 'loading') return 'loading'
  if (auth === 'signedOut') return 'signin'
  if (role === null) return 'loading'
  if (role === 'waiting') return 'waiting'
  if (role === 'removed') return 'removed'
  return 'app'
}
