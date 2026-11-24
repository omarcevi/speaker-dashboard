import { describe, expect, it } from 'vitest'
import { cleanEmailHtml, isBlankHtml, renderHtmlEmail, templateHtml } from '../src/shared/emailHtml.js'
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

  it('fillsSignature', () => {
    const r = renderHtmlEmail({ subject: 's', html: '<p>Hi {{firstName}}</p>' }, { firstName: 'Ada', venue: 'Hall <A> & "B"' },
      '<p>See you at {{venue}}, {{ firstName }}</p>')
    expect(r).toMatchObject({ ok: true, html: '<p>Hi Ada</p><br><p>See you at Hall &lt;A&gt; &amp; &quot;B&quot;, Ada</p>' })
  })

  it('signatureFillInsBlockLikeBody', () => {
    const r = renderHtmlEmail({ subject: 's', html: '<p>Hi</p>' }, { venue: ' ' }, '<p>{{venue}} {{nope}} {{<b>firstName</b>}}</p>')
    expect(r).toEqual({ ok: false, missing: ['nope', '{{<b>firstName</b>}}'], empty: ['venue'] })
  })

  it('blankSignatureFillInsIgnored', () => {
    expect(renderHtmlEmail({ subject: 's', html: '<p>Hi</p>' }, {}, '<p></p>')).toMatchObject({ ok: true, html: '<p>Hi</p>' })
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

  it('dropsImagesWithoutAllowedSrc', () => {
    expect(cleanEmailHtml('<img src="data:x" alt="x">')).toBe('')
    expect(isBlankHtml('<p><img src="cid:x"></p>')).toBe(true)
    expect(isBlankHtml('<p><img src="https://x.test/a.png"></p>')).toBe(false)
  })

  it('acceptsSchemeInAnyCase', () => {
    expect(cleanEmailHtml('<a href="HTTPS://X.test">x</a>')).toBe('<a href="HTTPS://X.test" target="_blank" rel="noopener noreferrer">x</a>')
  })

  it('keepsAndDropsUrlsByScheme', () => {
    expect(cleanEmailHtml('<img src="http://t.test/p.gif">')).toBe('<img src="http://t.test/p.gif">')
    expect(cleanEmailHtml('<a href="mailto:a@b.test">m</a>')).toContain('href="mailto:a@b.test"')
    expect(cleanEmailHtml('<img src="mailto:a@b.test" alt="x">')).toBe('')
    expect(cleanEmailHtml('<style>p{color:red}</style>q')).toBe('q')
  })
})
