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

const OVERVIEW_KEY = 'overviewOpen'

export function loadOverviewOpen(): boolean {
  try {
    return localStorage.getItem(OVERVIEW_KEY) !== 'false'
  } catch {
    return true
  }
}

export function saveOverviewOpen(v: boolean) {
  try {
    localStorage.setItem(OVERVIEW_KEY, String(v))
  } catch {
    // storage unavailable; the choice just won't persist
  }
}

const PROJECTOR_KEY = 'projectorView'

export function loadProjector(): boolean {
  try {
    return localStorage.getItem(PROJECTOR_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveProjector(v: boolean) {
  try {
    localStorage.setItem(PROJECTOR_KEY, String(v))
  } catch {
    // storage unavailable; the choice just won't persist
  }
}
