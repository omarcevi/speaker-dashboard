import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FACTS_MAX, factsCounter } from '../lib/speakerFacts.ts'
import { SpeakerFacts } from './SpeakerFacts.tsx'

describe('factsCounter', () => {
  it('formats the count and flags only text over the cap', () => {
    expect(factsCounter('a'.repeat(1234))).toEqual({ label: '1,234 / 20,000', over: false })
    expect(factsCounter('a'.repeat(FACTS_MAX)).over).toBe(false)
    expect(factsCounter('a'.repeat(FACTS_MAX + 1))).toEqual({ label: '20,001 / 20,000', over: true })
  })
})

describe('SpeakerFacts section', () => {
  it('gives admins a textarea, the help text and the counter', () => {
    const html = renderToStaticMarkup(<SpeakerFacts admin value="Venue: Hall A" onChange={() => {}} />)
    expect(html).toContain('Speaker facts')
    expect(html).toContain('What reply drafts may state. Anything not here becomes a [gap] in the draft.')
    expect(html).toContain('<textarea')
    expect(html).toContain('13 / 20,000')
    expect(html).not.toContain('Only admins')
  })
  it('shows members plain text, no textarea', () => {
    const html = renderToStaticMarkup(<SpeakerFacts admin={false} value="Venue: Hall A" onChange={() => {}} />)
    expect(html).not.toContain('<textarea')
    expect(html).toContain('Venue: Hall A')
    expect(html).toContain('Only admins can change it.')
  })
  it('flags text over the cap', () => {
    const html = renderToStaticMarkup(<SpeakerFacts admin value={'a'.repeat(FACTS_MAX + 1)} onChange={() => {}} />)
    expect(html).toContain('20,001 / 20,000')
    expect(html).toContain('role="alert"')
  })
})
