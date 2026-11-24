import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Cell } from '../lib/stages.ts'
import StageCell from './StageCell.tsx'

const noop = () => {}
const cell = (kind: Cell['kind'], at: number | null = null): Cell => ({ kind, at, email: null })
const render = (c: Cell, admin: boolean, onOpen: (() => void) | null = noop) =>
  renderToStaticMarkup(<StageCell cell={c} admin={admin} onOpen={onOpen} onMenu={noop} expanded={false} />)
// 4 Nov 2026 and 1 Dec 2026, noon Istanbul.
const NOV4 = Date.UTC(2026, 10, 4, 9)
const DEC1 = Date.UTC(2026, 11, 1, 0)

describe('StageCell', () => {
  it('shows a missing cell to a member as static text, with no button', () => {
    const out = render(cell('missing'), false)
    expect(out).toContain('cellbtn static')
    expect(out).toContain('Missing')
    expect(out).not.toContain('<button')
  })

  it('makes a missing cell a menu button for an admin', () => {
    const out = render(cell('missing'), true)
    expect(out).toContain('<button')
    expect(out).toContain('aria-haspopup="menu"')
    expect(out).toContain('Missing')
  })

  it('makes a sent cell a button for everyone', () => {
    for (const admin of [true, false]) {
      const out = render(cell('sent', NOV4), admin)
      expect(out).toContain('<button')
      expect(out).toContain('Sent 4 Nov')
    }
  })

  it('shows a sent cell with no conversation and no talk page as static text', () => {
    const out = render(cell('manual', NOV4), true, null)
    expect(out).toContain('cellbtn static')
    expect(out).toContain('Marked sent 4 Nov')
    expect(out).not.toContain('<button')
  })

  it('labels a Not for this speaker button on the button itself', () => {
    const out = render(cell('notFor'), true)
    expect(out).toMatch(/<button[^>]*aria-label="Not for this speaker"/)
    expect(out).not.toContain('class="vh"')
  })

  it('keeps Not for this speaker readable for a member', () => {
    const out = render(cell('notFor'), false)
    expect(out).toContain('<span class="vh">Not for this speaker</span>')
  })

  it('shows a due cell to a member as faint text', () => {
    const out = render(cell('due', DEC1), false)
    expect(out).toContain('Due 1 Dec')
    expect(out).toContain('faint')
  })
})
