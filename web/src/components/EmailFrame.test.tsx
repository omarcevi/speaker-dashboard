import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EmailFrame } from './EmailFrame.tsx'

describe('EmailFrame', () => {
  it('is a sandboxed iframe: no scripts, no same-origin, links may open a tab', () => {
    const out = renderToStaticMarkup(<EmailFrame html="<p>Hi</p>" title="Preview" />)
    const sandbox = /sandbox="([^"]*)"/.exec(out)?.[1]
    expect(sandbox).toBe('allow-popups allow-popups-to-escape-sandbox')
    expect(sandbox).not.toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
    expect(out).toContain('title="Preview"')
    expect(out).toContain('class="email-frame"')
  })

  it('has a compact size for conversations', () => {
    expect(renderToStaticMarkup(<EmailFrame html="<p>Hi</p>" title="Sent" compact />)).toContain('class="email-frame compact"')
  })
})
