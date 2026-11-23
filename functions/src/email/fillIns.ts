// Shared with the web app (Vite bundles it, so the preview matches the server). May import only ../model.js,
// ../talkKey.js and other files in shared/ or email/. Currently imports nothing.

export const SPEAKER_FILL_INS = ['firstName', 'lastName', 'fullName', 'talkTitles', 'talkCount', 'coSpeakerNames'] as const

// A fill-in is {{name}} (spaces allowed inside the braces); a name is letters and digits, starting with a letter.
const PAIR = /\{\{([^{}\n]*)\}\}/g
const NAME = /^[a-zA-Z][a-zA-Z0-9]*$/
// Braces left over once the pairs are taken out: an unmatched "{{" or "}}" with the word next to it.
const STRAY = /\{\{[^\s{}]*\}?|\{?[^\s{}]*\}\}/g

export const isFillInName = (s: string) => NAME.test(s)

/** How a fill-in from fillInsIn / renderEmail is shown: a name as "{{name}}", a malformed one as written. */
export const fillInLabel = (n: string) => (isFillInName(n) ? `{{${n}}}` : n)

export type FillInPart = { kind: 'text'; text: string } | { kind: 'fill'; text: string; name: string } | { kind: 'malformed'; text: string }

/** `text` split into plain text, fill-ins and malformed fill-ins ("{{first name}}", "{{ }}", a lone "{{" or "}}"). */
export function fillInParts(text: string): FillInPart[] {
  const out: FillInPart[] = []
  const plain = (s: string) => {
    let last = 0
    for (const m of s.matchAll(STRAY)) {
      if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) })
      out.push({ kind: 'malformed', text: m[0] })
      last = m.index + m[0].length
    }
    if (last < s.length) out.push({ kind: 'text', text: s.slice(last) })
  }
  let last = 0
  for (const m of text.matchAll(PAIR)) {
    plain(text.slice(last, m.index))
    const name = m[1].trim()
    out.push(NAME.test(name) ? { kind: 'fill', text: m[0], name } : { kind: 'malformed', text: m[0] })
    last = m.index + m[0].length
  }
  plain(text.slice(last))
  return out
}

// Fill-in names used in `text`, de-duplicated, in order of appearance. A malformed fill-in is listed as its raw text
// (e.g. "{{first name}}"), which is never a known name, so it blocks a send like an unknown one.
export function fillInsIn(text: string): string[] {
  const out: string[] = []
  for (const p of fillInParts(text)) {
    const n = p.kind === 'fill' ? p.name : p.kind === 'malformed' ? p.text : null
    if (n !== null && !out.includes(n)) out.push(n)
  }
  return out
}

export type Rendered = { ok: true; subject: string; text: string; html: string } | { ok: false; missing: string[]; empty: string[] }

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Escape text, turning http(s) URLs into links. Trailing punctuation is left outside the link.
function linkify(text: string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(/https?:\/\/\S+/g)) {
    const url = m[0].replace(/[.,;:!?)]+$/, '')
    if (!/^https?:\/\/./.test(url)) continue
    const at = m.index
    out += escapeHtml(text.slice(last, at)) + `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`
    last = at + url.length
  }
  return out + escapeHtml(text.slice(last))
}

// The HTML part for a plain-text email body.
export const toHtml = (text: string) =>
  text.replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n+/)
    .filter((p) => p.trim() !== '')
    .map((p) => `<p>${linkify(p).replace(/\n/g, '<br>')}</p>`).join('')

export function renderEmail(t: { subject: string; body: string }, values: Record<string, string>): Rendered {
  const names = [...new Set([...fillInsIn(t.subject), ...fillInsIn(t.body)])]
  const has = (n: string) => Object.prototype.hasOwnProperty.call(values, n)
  const missing = names.filter((n) => !has(n))
  const empty = names.filter((n) => has(n) && values[n].trim() === '')
  if (missing.length || empty.length) return { ok: false, missing, empty }
  const fill = (s: string) => fillInParts(s).map((p) => (p.kind === 'fill' ? values[p.name] : p.text)).join('')
  const text = fill(t.body)
  return { ok: true, subject: fill(t.subject), text, html: toHtml(text) }
}

// Error text for an unusable event field key, or null when it is fine.
export function validEventKey(key: string, existing: string[]): string | null {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) return 'Use letters and digits only, starting with a letter.'
  if ((SPEAKER_FILL_INS as readonly string[]).includes(key)) return 'That name is built in.'
  if (existing.includes(key)) return 'That name is already used.'
  return null
}
