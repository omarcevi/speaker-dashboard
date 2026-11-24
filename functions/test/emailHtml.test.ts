import { describe, expect, it } from 'vitest'
import { cleanEmailHtml, renderHtmlEmail, templateHtml } from '../src/shared/emailHtml.js'
import { fillInsIn, renderEmail } from '../src/email/fillIns.js'

describe('emailHtml', () => {
  it('escapesFillIns', () => {
    const r = renderHtmlEmail({ subject: 'Hi {{firstName}}', html: '<p>Dear {{firstName}}</p>' }, { firstName: 'Ada <b>&' }, '')
    expect(r).toEqual({ ok: true, subject: 'Hi Ada <b>&', html: '<p>Dear Ada &lt;b&gt;&amp;</p>' })
  })

  it('talkTitlesKeepLines', () => {
    const r = renderHtmlEmail({ subject: 's', html: '<p>{{talkTitles}}</p>' }, { talkTitles: '• One\n• Two' }, '')
    expect(r).toMatchObject({ ok: true, html: '<p>• One<br>• Two</p>' })
  })

  it('appendsSignature', () => {
    const r = renderHtmlEmail({ subject: 's', html: '<p>Hi</p>' }, {}, '<p>Team</p><p><img src="https://x.test/l.png" alt="logo"></p>')
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.html).toBe('<p>Hi</p><br><p>Team</p><p><img src="https://x.test/l.png" alt="logo"></p>')
  })

  it('emptySignatureAddsNothing', () => {
    const r = renderHtmlEmail({ subject: 's', html: '<p>Hi</p>' }, {}, '<p></p>')
    expect(r).toMatchObject({ ok: true, html: '<p>Hi</p>' })
  })

  it('stripsScriptsAndHandlers', () => {
    const out = cleanEmailHtml('<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">b</a><img src="data:x">')
    expect(out).toContain('a')
    expect(out).toContain('b')
    for (const bad of ['onclick', 'script', 'alert', 'javascript:', 'data:']) expect(out).not.toContain(bad)
  })

  it('unwrapsUnknownTags', () => {
    expect(cleanEmailHtml('<font color="red">Hi</font><div class="x" style="color:red">there</div>')).toBe('Hi<div>there</div>')
  })

  it('linksOpenInNewTab', () => {
    expect(cleanEmailHtml('<a href="https://a.test">x</a>')).toBe('<a href="https://a.test" target="_blank" rel="noopener noreferrer">x</a>')
  })

  it('splitFillInIsMalformed', () => {
    const html = '<p>{{<b>firstName</b>}}</p>'
    // The same check renderEmail uses: a malformed fill-in is listed by its raw text and blocks the render.
    expect(fillInsIn(html)).toEqual(['{{<b>firstName</b>}}'])
    expect(renderEmail({ subject: 's', body: '{{<b>firstName</b>}}' }, { firstName: 'Ada' })).toEqual({ ok: false, missing: ['{{<b>firstName</b>}}'], empty: [] })
    expect(renderHtmlEmail({ subject: 's', html }, { firstName: 'Ada' }, '')).toEqual({ ok: false, missing: ['{{<b>firstName</b>}}'], empty: [] })
  })

  it('templateHtmlFallsBack', () => {
    expect(templateHtml({ body: 'a\n\nb' })).toBe('<p>a</p><p>b</p>')
    expect(templateHtml({ body: 'x', html: '<p></p>' })).toBe('<p>x</p>')
    expect(templateHtml({ body: 'x', html: '<p>y</p>' })).toBe('<p>y</p>')
  })

  it('missingFillIn', () => {
    expect(renderHtmlEmail({ subject: 's', html: '<p>{{venue}}</p>' }, {}, '')).toEqual({ ok: false, missing: ['venue'], empty: [] })
  })

  it('emptyFillIn', () => {
    expect(renderHtmlEmail({ subject: 's', html: '<p>{{venue}}</p>' }, { venue: ' ' }, '')).toEqual({ ok: false, missing: [], empty: ['venue'] })
  })
})
