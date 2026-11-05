import { describe, expect, it } from 'vitest'
import type { Role, UserDoc } from '../../../functions/src/model.ts'
import { teamGroups } from './team.ts'

const u = (uid: string, name: string, role: Role): UserDoc & { uid: string } =>
  ({ uid, name, role, email: `${uid}@example.com`, photoURL: '', createdAt: { toMillis: () => 0 } })

describe('teamGroups', () => {
  it('puts each user in their role group, sorted by name', () => {
    const g = teamGroups([u('1', 'Zed', 'member'), u('2', 'amy', 'member'), u('3', 'Bo', 'admin'), u('4', 'Cy', 'waiting')])
    expect(g.member.map((x) => x.uid)).toEqual(['2', '1'])
    expect(g.admin.map((x) => x.uid)).toEqual(['3'])
    expect(g.waiting.map((x) => x.uid)).toEqual(['4'])
  })
  it('keeps empty groups as []', () => {
    expect(teamGroups([])).toEqual({ waiting: [], member: [], admin: [], removed: [] })
  })
})
