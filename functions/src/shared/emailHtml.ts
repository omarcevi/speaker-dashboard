// Shared with the web app (Vite bundles it, so the editor preview matches what the server sends). Server-safe and
// browser-safe: no Node imports. May import only ../model.js, ../talkKey.js and other files in shared/ or email/fillIns.js.

import { FilterXSS, escapeAttrValue, friendlyAttrValue } from 'xss'
import { fillInParts, fillInsIn, toHtml } from '../email/fillIns.js'

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'hr', 'span', 'div']

const whiteList: Record<string, string[]> = Object.fromEntries(ALLOWED_TAGS.map((t) => [t, []]))
whiteList.a = ['href']
whiteList.img = ['src', 'alt', 'width', 'height']

// href and src must be absolute http(s); mailto: is for links only.
const SAFE_URL: Record<string, RegExp> = {
  a: /^(https?:\/\/|mailto:)/i,
  img: /^https?:\/\//i,
}

const SAFE_SRC = (tag: string, value: string) => (SAFE_URL[tag]?.test(value.trim()) ? undefined : '')

const filter = new FilterXSS({
  whiteList,
  stripIgnoreTag: true, // unknown tags are unwrapped: the tag goes, its text stays
  stripIgnoreTagBody: ['script', 'style'], // these go with their contents
  // Drop a link or image whose address is not allowed (an empty string removes the attribute).
  onTagAttr(tag, name, value) {
    if (name === 'href' || name === 'src') return SAFE_SRC(tag, value)
    return undefined
  },
  // The default only accepts a lower-case scheme and would leave a bare href, so href and src are checked above.
  safeAttrValue: (_tag, name, value) => (name === 'href' || name === 'src' ? escapeAttrValue(value.trim()) : escapeAttrValue(value)),
})

// Opening <a ... href="..."> tags in the filter's output get target and rel. The output is already sanitized, so every
// attribute value is quoted and free of raw quotes and angle brackets.
const addLinkAttrs = (html: string) => html.replace(/<a (?=[^>]*\bhref=")([^>]*)>/g, '<a $1 target="_blank" rel="noopener noreferrer">')
const dropBareImages = (html: string) => html.replace(/<img(?![^>]*\ssrc=)[^>]*>/g, '')

/** Email HTML restricted to the allowed tags and attributes; everything else is removed or unwrapped. */
export const cleanEmailHtml = (html: string): string => dropBareImages(addLinkAttrs(filter.process(html)))

// The signature may also keep a table layout and inline styles (a Gmail signature: logo, divider, title, links).
const TABLE_TAGS = ['table', 'tbody', 'thead', 'tr', 'td', 'th']
const STYLED = ['p', 'div', 'span', 'a', 'strong', 'b', 'em', 'i', 'table', 'tr', 'td', 'th', 'img', 'h1', 'h2', 'h3']
const CELL_ATTRS = ['width', 'height', 'align', 'valign', 'colspan', 'rowspan', 'cellpadding', 'cellspacing', 'border']

const signatureWhiteList: Record<string, string[]> = Object.fromEntries(
  [...ALLOWED_TAGS, ...TABLE_TAGS].map((t) => [t, [...(whiteList[t] ?? [])]]),
)
for (const t of ['table', 'td', 'th']) signatureWhiteList[t].push(...CELL_ATTRS)
for (const t of STYLED) signatureWhiteList[t].push('style')

const sides = (p: string) => [p, `${p}-top`, `${p}-right`, `${p}-bottom`, `${p}-left`]
const CSS_PROPS = [
  'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'text-decoration', 'text-align', 'vertical-align', 'width', 'height', 'max-width', 'min-width',
  ...sides('padding'), ...sides('margin'), ...sides('border'),
  'border-color', 'border-width', 'border-style', 'border-collapse', 'border-spacing', 'border-radius', 'white-space',
]
const cssWhiteList: Record<string, true | ((v: string) => boolean)> = Object.fromEntries(CSS_PROPS.map((p) => [p, true]))
cssWhiteList.display = (v) => /^(block|inline|inline-block|table|table-cell|none)$/i.test(v.trim())

// A value that could load something, run something or escape the declaration is dropped.
const UNSAFE_CSS = /url\(|expression|javascript:|@import|\\|<|\/\*/i

const signatureFilter = new FilterXSS({
  whiteList: signatureWhiteList,
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
  css: { whiteList: cssWhiteList, safeAttrValue: (_name: string, value: string) => (UNSAFE_CSS.test(value) ? '' : value) },
  onTagAttr(tag, name, value) {
    if (name === 'href' || name === 'src') return SAFE_SRC(tag, value)
    return undefined
  },
  // A style is decoded first (&#92; is a backslash), then each declaration goes through the CSS filter above, so one
  // bad declaration drops only itself.
  safeAttrValue: (_tag, name, value, cssFilter) =>
    name === 'style' ? escapeAttrValue(cssFilter.process(friendlyAttrValue(value)))
    : name === 'href' || name === 'src' ? escapeAttrValue(value.trim()) : escapeAttrValue(value),
})

/**
 * The team signature: everything cleanEmailHtml keeps, plus tables and a limited set of inline styles, so a
 * two-column signature keeps its layout.
 */
export const cleanSignatureHtml = (html: string): string => dropBareImages(addLinkAttrs(signatureFilter.process(html)))

/** True when the cleaned HTML has no text and no image. */
export function isBlankHtml(html: string): boolean {
  const clean = cleanEmailHtml(html)
  if (/<img[\s>/]/i.test(clean)) return false
  return clean.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim() === ''
}

/** The HTML of a template: its own when it has content, else the plain-text body as paragraphs. */
export const templateHtml = (t: { body: string; html?: string | null }): string =>
  typeof t.html === 'string' && !isBlankHtml(t.html) ? t.html : toHtml(t.body)

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const escapeValue = (s: string) => escapeHtml(s).replace(/\r\n?|\n/g, '<br>')

export type RenderedHtml = { ok: true; subject: string; html: string } | { ok: false; missing: string[]; empty: string[] }

/**
 * Fills the subject (plain text), body and signature (escaped HTML) and appends the signature. Missing and empty
 * fill-ins, the signature's included, are reported exactly as renderEmail does.
 */
export function renderHtmlEmail(t: { subject: string; html: string }, values: Record<string, string>, signatureHtml: string): RenderedHtml {
  const signed = !isBlankHtml(signatureHtml)
  const names = [...new Set([...fillInsIn(t.subject), ...fillInsIn(t.html), ...(signed ? fillInsIn(signatureHtml) : [])])]
  const has = (n: string) => Object.prototype.hasOwnProperty.call(values, n)
  const missing = names.filter((n) => !has(n))
  const empty = names.filter((n) => has(n) && values[n].trim() === '')
  if (missing.length || empty.length) return { ok: false, missing, empty }
  const fill = (s: string, value: (v: string) => string) => fillInParts(s).map((p) => (p.kind === 'fill' ? value(values[p.name]) : p.text)).join('')
  const body = cleanEmailHtml(fill(t.html, escapeValue))
  const signature = signed ? `<br>${cleanSignatureHtml(fill(signatureHtml, escapeValue))}` : ''
  return { ok: true, subject: fill(t.subject, (v) => v), html: body + signature }
}
