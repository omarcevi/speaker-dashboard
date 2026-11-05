export interface Neighbors {
  prev: string | null
  next: string | null
  position: number | null
  total: number
}

export function neighbors(order: string[], inFilter: (id: string) => boolean, currentId: string): Neighbors {
  const passing = order.filter(inFilter)
  const at = order.indexOf(currentId)
  const index = passing.indexOf(currentId)
  const position = index === -1 ? null : index + 1
  if (at === -1) return { prev: null, next: passing[0] ?? null, position, total: passing.length }
  let prev: string | null = null
  for (let i = at - 1; i >= 0; i--) if (inFilter(order[i])) { prev = order[i]; break }
  let next: string | null = null
  for (let i = at + 1; i < order.length; i++) if (inFilter(order[i])) { next = order[i]; break }
  return { prev, next, position, total: passing.length }
}
