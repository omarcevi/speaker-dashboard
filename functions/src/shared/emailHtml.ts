// Shared with the web app (Vite bundles it, so the editor preview matches what the server sends). Server-safe and
// browser-safe: no Node imports. May import only ../model.js, ../talkKey.js and other files in shared/ or email/fillIns.js.

import { FilterXSS, escapeAttrValue } from 'xss'
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

const filter = new FilterXSS({
  whiteList,
  stripIgnoreTag: true, // unknown tags are unwrapped: the tag goes, its text stays
  stripIgnoreTagBody: ['script', 'style'], // these go with their contents
  // Drop a link or image whose address is not allowed (an empty string removes the attribute).
  onTagAttr(tag, name, value) {
    if (name === 'href' || name === 'src') return SAFE_URL[tag]?.test(value.trim()) ? undefined : ''
    return undefined
  },
  // The default only accepts a lower-case scheme and would leave a bare href, so href and src are checked above.
  safeAttrValue: (_tag, name, value) => (name === 'href' || name === 'src' ? escapeAttrValue(value.trim()) : escapeAttrValue(value)),
})

// Opening <a href="..."> tags in the filter's output get target and rel. The output is already sanitized, so every
// attribute value is quoted and free of raw quotes.
const addLinkAttrs = (html: string) => html.replace(/<a href="[^"]*"/g, (m) => `${m} target="_blank" rel="noopener noreferrer"`)

/** Email HTML restricted to the allowed tags and attributes; everything else is removed or unwrapped. */
export const cleanEmailHtml = (html: string): string => addLinkAttrs(filter.process(html)).replace(/<img(?![^>]*\ssrc=)[^>]*>/g, '')

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
  const signature = signed ? `<br>${cleanEmailHtml(fill(signatureHtml, escapeValue))}` : ''
  return { ok: true, subject: fill(t.subject, (v) => v), html: body + signature }
}
