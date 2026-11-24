import { describe, expect, it } from 'vitest'
import { cleanEmailHtml, cleanSignatureHtml, isBlankHtml, renderHtmlEmail, templateHtml } from '../src/shared/emailHtml.js'
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

describe('cleanSignatureHtml', () => {
  // A two-column Gmail-style signature: logo, a divider, then title, subtitle and link.
  const TWO_COLUMN = '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tbody><tr>'
    + '<td valign="top" width="72" style="padding-right:12px;"><img src="https://x.test/logo.png" alt="GDG" width="64" height="64"></td>'
    + '<td valign="top" style="border-left:2px solid #dadce0; padding-left:12px;">'
    + '<div><b style="font-size:14px; color:#202124;">DevFest Team</b></div>'
    + '<div><span style="color:#5f6368; font-family:Arial, sans-serif;">GDG Cloud</span></div>'
    + '<div><a href="https://devfest.test" style="color:#8ab4f8; text-decoration:none;">devfest.test</a></div>'
    + '</td></tr></tbody></table>'

  it('keepsTwoColumnLayout', () => {
    const withLinkAttrs = TWO_COLUMN.replace('href="https://devfest.test" style="color:#8ab4f8; text-decoration:none;"',
      'href="https://devfest.test" style="color:#8ab4f8; text-decoration:none;" target="_blank" rel="noopener noreferrer"')
    expect(cleanSignatureHtml(TWO_COLUMN)).toBe(withLinkAttrs)
  })

  it('dropsUnsafeDeclarationsKeepsAllowed', () => {
    const out = cleanSignatureHtml('<span style="color:#5f6368; background:url(https://e.test/x); background-color:url(https://e.test/y); '
      + 'width:expression(alert(1)); font-size:12px; position:fixed; behavior:url(x.htc); color:javascript:alert(1); '
      + 'margin:0 &#92;9; padding:@import x; display:flex">x</span><div style="display:inline-block">y</div>')
    expect(out).toBe('<span style="color:#5f6368; font-size:12px;">x</span><div style="display:inline-block;">y</div>')
  })

  it('removesScriptsAndHandlersInTables', () => {
    const out = cleanSignatureHtml('<table onclick="x()"><tr><td onmouseover="y()" style="color:red">a<script>alert(1)</script></td></tr></table>')
    expect(out).toBe('<table><tr><td style="color:red;">a</td></tr></table>')
  })

  it('keepsBodyRules', () => {
    expect(cleanSignatureHtml('<img alt="x">')).toBe('')
    expect(cleanSignatureHtml('<a href="javascript:alert(1)" style="color:red">x</a>')).toBe('<a style="color:red;">x</a>')
  })

  it('bodiesStillLoseTablesAndStyles', () => {
    expect(cleanEmailHtml('<table><tr><td style="color:red">a</td></tr></table><p style="color:red">b</p>')).toBe('a<p>b</p>')
  })

  it('tableSignatureFillsAndEscapes', () => {
    const sig = '<table><tr><td style="color:#5f6368;">See you at {{venue}}</td></tr></table>'
    const r = renderHtmlEmail({ subject: 's', html: '<p style="color:red">Hi</p>' }, { venue: 'Hall <A> & "B"' }, sig)
    expect(r).toMatchObject({ ok: true,
      html: '<p>Hi</p><br><table><tr><td style="color:#5f6368;">See you at Hall &lt;A&gt; &amp; &quot;B&quot;</td></tr></table>' })
    expect(renderHtmlEmail({ subject: 's', html: '<p>Hi</p>' }, {}, sig)).toEqual({ ok: false, missing: ['venue'], empty: [] })
  })

  it('blankTableSignature', () => {
    expect(isBlankHtml('<table><tr><td style="padding:4px"> </td></tr></table>')).toBe(true)
    expect(isBlankHtml(TWO_COLUMN)).toBe(false)
    expect(isBlankHtml('<table><tr><td><img src="https://x.test/l.png"></td></tr></table>')).toBe(false)
  })
})
