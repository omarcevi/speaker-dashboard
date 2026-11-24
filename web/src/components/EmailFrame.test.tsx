import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EmailFrame } from './EmailFrame.tsx'

describe('EmailFrame', () => {
  it('is a fully sandboxed iframe', () => {
    const out = renderToStaticMarkup(<EmailFrame html="<p>Hi</p>" title="Preview" />)
    expect(out).toContain('sandbox=""')
    expect(out).not.toContain('allow-')
    expect(out).toContain('title="Preview"')
  })
})
