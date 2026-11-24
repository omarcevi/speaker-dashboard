import { describe, expect, it } from 'vitest'
import { fillInLabel, fillInParts, fillInsIn, renderEmail, SPEAKER_FILL_INS, validEventKey } from '../src/email/fillIns.js'

describe('fillInsIn', () => {
  it('lists names in order, de-duplicated, allowing spaces', () => {
    expect(fillInsIn('{{ b }} x {{a}} {{b}} {c}')).toEqual(['b', 'a'])
  })
  it('lists malformed fill-ins as their raw text', () => {
    expect(fillInsIn('Hi {{first name}}, {{ }} {{firstName} {lastName}} {{a-b}} }} {{')).toEqual([
      '{{first name}}', '{{ }}', '{{firstName}', '{lastName}}', '{{a-b}}', '}}', '{{',
    ])
  })
  it('labels names as tokens and keeps malformed text as is', () => {
    expect(fillInLabel('venue')).toBe('{{venue}}')
    expect(fillInLabel('{{first name}}')).toBe('{{first name}}')
  })
  it('splits text into text, fill and malformed parts', () => {
    expect(fillInParts('Hi {{ a }}, {{b c}}!')).toEqual([
      { kind: 'text', text: 'Hi ' }, { kind: 'fill', text: '{{ a }}', name: 'a' }, { kind: 'text', text: ', ' },
      { kind: 'malformed', text: '{{b c}}' }, { kind: 'text', text: '!' },
    ])
  })
})

describe('renderEmail', () => {
  it('fills subject and body and keeps newlines in text', () => {
    const r = renderEmail({ subject: 'Hi {{firstName}}', body: 'Talks:\n{{talkTitles}}' }, { firstName: 'Ada', talkTitles: '• A\n• B' })
    expect(r).toMatchObject({ ok: true, subject: 'Hi Ada', text: 'Talks:\n• A\n• B' })
  })
  it('reports unknown and empty fill-ins', () => {
    expect(renderEmail({ subject: '{{venu}}', body: 'x' }, { venue: 'Hall' })).toEqual({ ok: false, missing: ['venu'], empty: [] })
    expect(renderEmail({ subject: 's', body: '{{venue}}' }, { venue: '' })).toEqual({ ok: false, missing: [], empty: ['venue'] })
  })
  it('treats whitespace-only values as empty and returns both lists', () => {
    expect(renderEmail({ subject: '{{a}} {{b}}', body: '{{c}}' }, { a: '  \n', c: 'ok' })).toEqual({ ok: false, missing: ['b'], empty: ['a'] })
  })
  it('fills names with spaces; single braces stay text', () => {
    const r = renderEmail({ subject: '{{ firstName }}', body: '{firstName}' }, { firstName: 'Ada' })
    expect(r).toMatchObject({ ok: true, subject: 'Ada', text: '{firstName}' })
  })
  it('blocks malformed fill-ins instead of sending them literally', () => {
    expect(renderEmail({ subject: 'Hi {{first name}}', body: '{{firstName}' }, { firstName: 'Ada' }))
      .toEqual({ ok: false, missing: ['{{first name}}', '{{firstName}'], empty: [] })
    expect(renderEmail({ subject: 's', body: 'x {{ }} y' }, {})).toEqual({ ok: false, missing: ['{{ }}'], empty: [] })
    expect(renderEmail({ subject: 's', body: 'x }} y' }, {})).toEqual({ ok: false, missing: ['}}'], empty: [] })
  })
  it('does not trip on braces inside filled values', () => {
    expect(renderEmail({ subject: 's', body: '{{t}}' }, { t: 'a {{b}} c}}' })).toMatchObject({ ok: true, text: 'a {{b}} c}}' })
  })
  it('builds html with paragraphs, br, links and escaping', () => {
    const r = renderEmail({ subject: 's', body: 'One\nTwo\n\nSee https://x.test/a?b=1&c. Bye {{n}}' }, { n: '<script>x</script>' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.html).toBe('<p>One<br>Two</p><p>See <a href="https://x.test/a?b=1&amp;c">https://x.test/a?b=1&amp;c</a>. Bye &lt;script&gt;x&lt;/script&gt;</p>')
    expect(r.html).not.toContain('<script>')
  })
  it('excludes trailing punctuation from links', () => {
    const r = renderEmail({ subject: 's', body: '(https://x.test/p), done' }, {})
    if (!r.ok) throw new Error('not ok')
    expect(r.html).toContain('<a href="https://x.test/p">https://x.test/p</a>),')
  })
})

describe('validEventKey', () => {
  it('rejects reserved, duplicate and malformed keys', () => {
    expect(SPEAKER_FILL_INS).toContain('firstName')
    expect(validEventKey('firstName', [])).toEqual(expect.any(String))
    expect(validEventKey('venue', ['venue'])).toEqual(expect.any(String))
    expect(validEventKey('1x', [])).toEqual(expect.any(String))
    expect(validEventKey('a b', [])).toEqual(expect.any(String))
    expect(validEventKey('venue', [])).toBeNull()
  })
})

describe('renderProblem', () => {
  it('names unknown and malformed fill-ins apart', async () => {
    const { renderProblem } = await import('../src/email/compose.js')
    expect(renderProblem(['venu', '{{first name}}'], ['deadline']))
      .toBe('Unknown fill-in: venu; Malformed fill-in: {{first name}}; Empty fill-in: deadline')
  })
})
