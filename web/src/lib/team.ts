import type { Role, UserDoc } from '../../../functions/src/model.ts'

export type TeamUser = UserDoc & { uid: string }

export function teamGroups(users: TeamUser[]): Record<Role, TeamUser[]> {
  const groups: Record<Role, TeamUser[]> = { waiting: [], member: [], admin: [], removed: [] }
  for (const u of users) groups[u.role]?.push(u)
  for (const list of Object.values(groups)) list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.uid.localeCompare(b.uid))
  return groups
}
