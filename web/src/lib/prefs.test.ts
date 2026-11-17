import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadOverviewOpen, loadProjector, saveOverviewOpen, saveProjector } from './prefs.ts'

afterEach(() => vi.unstubAllGlobals())

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('overview open preference', () => {
  it('defaults to true', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadOverviewOpen()).toBe(true)
  })
  it('round-trips the saved value', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    saveOverviewOpen(false)
    expect(loadOverviewOpen()).toBe(false)
    saveOverviewOpen(true)
    expect(loadOverviewOpen()).toBe(true)
  })
  it('falls back to true when storage throws', () => {
    const boom = () => { throw new Error('denied') }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom })
    expect(loadOverviewOpen()).toBe(true)
    expect(() => saveOverviewOpen(false)).not.toThrow()
  })
})

describe('projector view preference', () => {
  it('defaults to false', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadProjector()).toBe(false)
  })
  it('round-trips the saved value', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    saveProjector(true)
    expect(loadProjector()).toBe(true)
    saveProjector(false)
    expect(loadProjector()).toBe(false)
  })
  it('falls back to false when storage throws', () => {
    const boom = () => { throw new Error('denied') }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom })
    expect(loadProjector()).toBe(false)
    expect(() => saveProjector(true)).not.toThrow()
  })
})
