// Turns a Gmail API message (format=full) into a ReceivedMessage: reply, bounce or team message,
// with the body as plain text (HTML converted, never markup) and quoted earlier messages split off.
// Server-only: not bundled by the web app.
import type { gmail_v1 } from 'googleapis'
import type { ReceivedMessage } from '../model.js'

export type GmailMessage = Pick<gmail_v1.Schema$Message, 'id' | 'threadId' | 'labelIds' | 'internalDate' | 'payload'>
type Part = gmail_v1.Schema$MessagePart

export type ParsedMessage = Omit<ReceivedMessage, 'at'> & {
  atMs: number
  rfcMessageId: string
  /** Why delivery failed; set only when kind is 'bounce'. */
  bounceReason: string | null
}

const BOUNCE_REASON_MAX = 300

function headerOf(p: Part | undefined, name: string): string {
  const n = name.toLowerCase()
  return p?.headers?.find(h => h.name?.toLowerCase() === n)?.value ?? ''
}

/** A parameter of a structured header such as Content-Type (`charset`, `report-type`). */
function param(value: string, name: string): string {
  const m = new RegExp(`;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(value)
  return (m?.[1] ?? m?.[2] ?? '').trim()
}

function decodeBytes(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes)
  } catch {
    return bytes.toString('utf8')
  }
}

/** Decodes RFC 2047 encoded words in case Gmail hands a header over undecoded. */
export function decodeHeader(v: string): string {
  return v
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?[^?]+\?[BbQq]\?[^?]*\?=)/g, '$1')
    .replace(/=\?([^?*]+)(?:\*[^?]*)?\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, enc: string, data: string) => {
      const bytes = enc.toUpperCase() === 'B'
        ? Buffer.from(data, 'base64')
        : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1')
      return decodeBytes(bytes, charset)
    })
}

const ENCODED_WORD = /=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=/y

/**
 * Splits a raw (undecoded) address header on commas outside quotes, angle brackets and encoded words;
 * returns lower-cased addresses. Decoding first would let an encoded "Last, First" name split the list.
 */
export function addresses(v: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  let inAngle = false
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (c === '=' && !inQuote) {
      ENCODED_WORD.lastIndex = i
      const w = ENCODED_WORD.exec(v)
      if (w) { cur += w[0]; i += w[0].length - 1; continue }
    }
    if (c === '\\' && inQuote) { cur += c + (v[++i] ?? ''); continue }
    if (c === '"') inQuote = !inQuote
    else if (!inQuote && c === '<') inAngle = true
    else if (!inQuote && c === '>') inAngle = false
    if (c === ',' && !inQuote && !inAngle) { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out
    .map(a => {
      const angle = /<([^<>]*)>/.exec(a.replace(/"(?:\\.|[^"\\])*"/g, '').replace(/=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=/g, ''))
      return (angle ? angle[1] : a).trim().toLowerCase()
    })
    .filter(Boolean)
}

const partBody = (p: Part): string =>
  p.body?.data ? decodeBytes(Buffer.from(p.body.data, 'base64url'), param(headerOf(p, 'Content-Type'), 'charset')) : ''

const isAttachmentPart = (p: Part) => Boolean(p.filename && p.body?.attachmentId)
const mime = (p: Part) => (p.mimeType ?? '').toLowerCase()

interface Walked { plain: string | null; html: string | null; status: string | null; attachments: ReceivedMessage['attachments'] }

/** Depth-first walk; an attached original message (message/rfc822) is not searched for bodies. */
function walk(p: Part, acc: Walked): Walked {
  const type = mime(p)
  if (isAttachmentPart(p)) {
    acc.attachments.push({ id: p.body!.attachmentId!, name: p.filename!, size: p.body?.size ?? 0, mimeType: p.mimeType ?? 'application/octet-stream' })
    return acc
  }
  if (type === 'message/delivery-status' || type === 'message/global-delivery-status') {
    acc.status ??= partBody(p)
    return acc
  }
  if (type === 'message/rfc822') return acc
  const inline = !/^attachment/i.test(headerOf(p, 'Content-Disposition'))
  if (type === 'text/plain' && inline && acc.plain === null) acc.plain = partBody(p)
  else if (type === 'text/html' && inline && acc.html === null) acc.html = partBody(p)
  for (const c of p.parts ?? []) walk(c, acc)
  return acc
}

function hasPart(p: Part, types: string[]): boolean {
  return types.includes(mime(p)) || (p.parts ?? []).some(c => hasPart(c, types))
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', euro: '€', zwnj: '', zwj: '',
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

const BLOCK = 'p|div|li|ul|ol|tr|table|h[1-6]|blockquote|pre|section|article|header|footer|hr|dl|dt|dd'

/** Plain text from HTML: block tags become line breaks, all other markup is dropped. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    .replace(/<(head|style|script|title)\b[\s\S]*?(<\/\1\s*>|$)/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(new RegExp(`</?(?:${BLOCK})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/<[a-z/!?][^>]*$/i, '')
  // HTML whitespace was collapsed above, so a leading space on a line is layout, not indentation.
  return tidy(decodeEntities(text.replace(/^ +/gm, '')).replace(/\u00a0/g, ' '))
}

/** Strips trailing whitespace per line (keeping indentation), collapses 3+ newlines, drops blank lines at both ends. */
const tidy = (s: string) =>
  s.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s+$/g, '')

const ATTRIBUTION = [/^On .+ wrote:$/, /^\d{1,2} .+ tarihinde .+ şunu yazdı:$/]

/** Splits plain text into the new part and the quoted earlier messages. */
export function splitQuoted(text: string): { text: string; quoted: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const isAttribution = (l: string) => ATTRIBUTION.some(r => r.test(l.trim()))
  // Clients wrap long attributions ("On … <" / "addr> wrote:"), so also try each line joined with the next.
  let at = lines.findIndex((l, i) => isAttribution(l) || (i + 1 < lines.length && isAttribution(`${l.trim()} ${lines[i + 1].trim()}`)))
  if (at < 0) {
    let end = lines.length
    while (end > 0 && lines[end - 1].trim() === '') end--
    let start = end
    while (start > 0 && lines[start - 1].startsWith('>')) start--
    if (start < end && start > 0) at = start
  }
  if (at < 0) return { text: tidy(text), quoted: '' }
  return { text: tidy(lines.slice(0, at).join('\n')), quoted: tidy(lines.slice(at).join('\n')) }
}

/** Splits HTML at Gmail's quote block (`gmail_quote`), if any. */
function splitGmailQuote(html: string): { text: string; quoted: string } | null {
  const m = /<(div|blockquote)\b[^>]*class\s*=\s*["'][^"']*\bgmail_quote(?:_container)?\b[^"']*["'][^>]*>/i.exec(html)
  if (!m) return null
  return { text: htmlToText(html.slice(0, m.index)), quoted: htmlToText(html.slice(m.index)) }
}

function bounceReason(status: string | null, text: string): string {
  if (status) {
    const unfolded = status.replace(/\r\n?/g, '\n').replace(/\n[ \t]+/g, ' ')
    for (const field of ['Diagnostic-Code', 'Status']) {
      const m = new RegExp(`^${field}:[ \\t]*(.+)$`, 'im').exec(unfolded)
      if (m?.[1].trim()) return m[1].trim()
    }
  }
  return [...text].slice(0, BOUNCE_REASON_MAX).join('')
}

/** `sender` is the dashboard mailbox; kept for the interface, classification relies on the SENT label (Ruling 6). */
export function parseMessage(m: GmailMessage, _sender: string): ParsedMessage {
  const payload: Part = m.payload ?? {}
  const from = addresses(headerOf(payload, 'From'))[0] ?? ''
  const walked = walk(payload, { plain: null, html: null, status: null, attachments: [] })

  const plainSplit = walked.plain !== null ? splitQuoted(walked.plain) : null
  const htmlSplit = walked.html !== null ? splitGmailQuote(walked.html) : null
  const body = plainSplit && (plainSplit.quoted || !htmlSplit)
    ? plainSplit
    : htmlSplit ?? (walked.html !== null ? splitQuoted(htmlToText(walked.html)) : { text: '', quoted: '' })

  const contentType = headerOf(payload, 'Content-Type')
  const isReport = mime(payload) === 'multipart/report' && param(contentType, 'report-type').toLowerCase() === 'delivery-status'
  const daemon = /^(mailer-daemon|postmaster)@/.test(from)
  const hasStatus = hasPart(payload, ['message/delivery-status', 'message/global-delivery-status'])
  // Ruling 6: From can be forged, so only Gmail's SENT label makes a team message, and a bounce
  // needs both the daemon sender and a delivery-status report.
  const kind: ReceivedMessage['kind'] =
    m.labelIds?.includes('SENT') ? 'team' : daemon && (isReport || hasStatus) ? 'bounce' : 'reply'

  const internal = Number(m.internalDate)
  const dated = Date.parse(headerOf(payload, 'Date'))
  return {
    kind,
    from,
    to: addresses(headerOf(payload, 'To')),
    cc: addresses(headerOf(payload, 'Cc')),
    subject: decodeHeader(headerOf(payload, 'Subject')),
    text: body.text,
    quoted: body.quoted,
    attachments: walked.attachments,
    atMs: Number.isFinite(internal) && internal > 0 ? internal : Number.isFinite(dated) ? dated : 0,
    rfcMessageId: headerOf(payload, 'Message-ID').trim(),
    bounceReason: kind === 'bounce' ? bounceReason(walked.status, body.text) : null,
  }
}
