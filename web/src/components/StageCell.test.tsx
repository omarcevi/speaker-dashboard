import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Cell } from '../lib/stages.ts'
import StageCell from './StageCell.tsx'

const noop = () => {}
const cell = (kind: Cell['kind'], at: number | null = null): Cell => ({ kind, at, email: null })
const render = (c: Cell, admin: boolean) => renderToStaticMarkup(<StageCell cell={c} admin={admin} onOpen={noop} onMenu={noop} expanded={false} />)
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

  it('hides Not for this speaker visually but keeps it readable', () => {
    const out = render(cell('notFor'), true)
    expect(out).toContain('Not for this speaker')
    expect(out).toContain('class="vh"')
  })

  it('shows a due cell to a member as faint text', () => {
    const out = render(cell('due', DEC1), false)
    expect(out).toContain('Due 1 Dec')
    expect(out).toContain('faint')
  })
})
