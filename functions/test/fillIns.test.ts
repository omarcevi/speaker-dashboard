import { describe, expect, it } from 'vitest'
import { fillInsIn, renderEmail, SPEAKER_FILL_INS, validEventKey } from '../src/email/fillIns.js'

describe('fillInsIn', () => {
  it('lists names in order, de-duplicated, allowing spaces', () => {
    expect(fillInsIn('{{ b }} x {{a}} {{b}} {c}')).toEqual(['b', 'a'])
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
