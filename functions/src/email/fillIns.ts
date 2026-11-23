// Shared with the web app (Vite bundles it, so the preview matches the server). May import only ../model.js,
// ../talkKey.js and other files in shared/ or email/. Currently imports nothing.

export const SPEAKER_FILL_INS = ['firstName', 'lastName', 'fullName', 'talkTitles', 'talkCount', 'coSpeakerNames'] as const

const TOKEN = /\{\{\s*([^{}\s]+)\s*\}\}/g

// Fill-in names used in `text` (written {{ name }}, spaces allowed), de-duplicated, in order of appearance.
export function fillInsIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TOKEN)) if (!out.includes(m[1])) out.push(m[1])
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

const toHtml = (text: string) =>
  text.replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n+/)
    .filter((p) => p.trim() !== '')
    .map((p) => `<p>${linkify(p).replace(/\n/g, '<br>')}</p>`).join('')

export function renderEmail(t: { subject: string; body: string }, values: Record<string, string>): Rendered {
  const names = [...new Set([...fillInsIn(t.subject), ...fillInsIn(t.body)])]
  const has = (n: string) => Object.prototype.hasOwnProperty.call(values, n)
  const missing = names.filter((n) => !has(n))
  const empty = names.filter((n) => has(n) && values[n].trim() === '')
  if (missing.length || empty.length) return { ok: false, missing, empty }
  const fill = (s: string) => s.replace(TOKEN, (_, n: string) => values[n])
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
