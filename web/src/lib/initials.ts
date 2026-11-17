// Up to two initials for a person's avatar, Turkish-aware (i → İ).
export const initials = (name: string) => name.trim().split(/\s+/).map((p) => p[0] ?? '').join('').slice(0, 2).toLocaleUpperCase('tr')
