import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadOverviewOpen, saveOverviewOpen } from './prefs.ts'

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
