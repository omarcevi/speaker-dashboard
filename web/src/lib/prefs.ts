const KEY = 'showAllScores'

export function loadShowAll(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

export function saveShowAll(v: boolean) {
  try {
    localStorage.setItem(KEY, String(v))
  } catch {
    // storage unavailable; the choice just won't persist
  }
}
