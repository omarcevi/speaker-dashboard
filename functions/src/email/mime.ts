// Builds outgoing RFC 5322 messages for the Gmail API (`users.messages.send({ raw })`).
// Server-only: not bundled by the web app, so node built-ins are fine here.
import { randomBytes } from 'node:crypto'

export interface OutgoingMessage {
  from: string
  to: string
  cc: string[]
  subject: string
  text: string
  html: string
  attachments: { name: string; contentType: string; data: Buffer }[]
  inReplyTo?: string
  references?: string
  messageId: string
}

const CRLF = '\r\n'
const MAX_LINE = 78
/** Bytes of UTF-8 per encoded word: 39 bytes -> 52 base64 chars -> 64-char word, so a word fits on any header line. */
const WORD_BYTES = 39

/** Header values never carry CR/LF: a fill-in with a newline must not start a new header. */
const oneLine = (v: string) => v.replace(/[\r\n]+/g, ' ')
const isAscii = (v: string) => /^[\x20-\x7e]*$/.test(v)

/** RFC 2047 B-encoded words, split on code-point boundaries. */
function encodedWords(v: string): string[] {
  const words: string[] = []
  let chunk = ''
  let size = 0
  for (const ch of v) {
    const n = Buffer.byteLength(ch, 'utf8')
    if (size + n > WORD_BYTES && chunk) {
      words.push(chunk)
      chunk = ''
      size = 0
    }
    chunk += ch
    size += n
  }
  if (chunk) words.push(chunk)
  return words.map(w => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`)
}

/** Tokens of an unstructured value; joined by single spaces they read back as the value. */
const textTokens = (v: string): string[] => (isAscii(v) ? v.split(' ') : encodedWords(v))

/** Joins tokens with spaces, folding (CRLF + space) between tokens to keep lines within 78 chars. */
function foldHeader(name: string, tokens: string[]): string {
  const lines: string[] = []
  let line = `${name}:`
  let empty = true
  for (const t of tokens) {
    if (!empty && line.length + 1 + t.length > MAX_LINE) {
      lines.push(line)
      line = ` ${t}`
    } else {
      line += ` ${t}`
    }
    empty = false
  }
  lines.push(line)
  return lines.join(CRLF)
}

const ATEXT_PHRASE = /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~ ]*$/
/** One bare addr-spec: one @, no whitespace, CR/LF, commas, angle brackets, quotes or other specials. */
const ADDR_SPEC = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+$/

function checkAddress(addr: string, field: string): string {
  if (!ADDR_SPEC.test(addr)) throw new Error(`Invalid ${field} address`)
  return addr
}

/** From: an optional display name (encoded when non-ASCII, quoted when it has specials) + <addr>. */
function fromTokens(input: string): string[] {
  const m = /^\s*(.*?)\s*<([^<>]*)>\s*$/.exec(input)
  if (!m) return [checkAddress(input.trim(), 'from')]
  const addr = `<${checkAddress(m[2], 'from')}>`
  let name = oneLine(m[1]).trim()
  if (/^".*"$/.test(name)) name = name.slice(1, -1).replace(/\\(.)/g, '$1')
  if (!name) return [addr]
  if (!isAscii(name)) return [...encodedWords(name), addr]
  if (ATEXT_PHRASE.test(name)) return [...name.split(' ').filter(Boolean), addr]
  return [`"${name.replace(/(["\\])/g, '\\$1')}"`, addr]
}

/** To/Cc: bare addresses only; anything else throws. */
const addressListTokens = (list: string[], field: string): string[] =>
  list.map((a, i) => checkAddress(a, field) + (i < list.length - 1 ? ',' : ''))

const base64Lines = (data: Buffer) => (data.toString('base64').match(/.{1,76}/g) ?? []).join(CRLF)
const crlf = (s: string) => s.replace(/\r\n|\r|\n/g, CRLF)
const boundary = (kind: string) => `${kind}_${randomBytes(12).toString('hex')}`

/** RFC 2231 percent-encoding: attr-char stays, every other byte becomes %XX. */
const rfc2231 = (v: string) =>
  [...Buffer.from(v, 'utf8')].map(b => {
    const c = String.fromCharCode(b)
    return /[A-Za-z0-9!#$&+\-.^_`|~]/.test(c) ? c : `%${b.toString(16).toUpperCase().padStart(2, '0')}`
  }).join('')

const quoted = (v: string) => `"${v.replace(/(["\\])/g, '\\$1')}"`

const NAME_MAX_CHARS = 150
const NAME_MAX_BYTES = 300

/** Shortens a filename to 150 code points and 300 UTF-8 bytes, keeping its extension, so header lines stay far below 998 chars. */
export function shortFilename(name: string): string {
  const chars = [...name]
  const fits = (c: string[]) => c.length <= NAME_MAX_CHARS && Buffer.byteLength(c.join(''), 'utf8') <= NAME_MAX_BYTES
  if (fits(chars)) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && [...name.slice(dot)].length <= 16 ? [...name.slice(dot)] : []
  const stem = chars.slice(0, chars.length - ext.length)
  while (stem.length && !fits([...stem, ...ext])) stem.pop()
  return [...stem, ...ext].join('')
}

function attachmentPart(a: { name: string; contentType: string; data: Buffer }): string {
  const name = shortFilename(oneLine(a.name).trim() || 'attachment')
  const type = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(a.contentType.trim()) ? a.contentType.trim() : 'application/octet-stream'
  const ascii = isAscii(name)
  return [
    `Content-Type: ${type};`,
    ` name=${ascii ? quoted(name) : quoted(encodedWords(name).join(' '))}`,
    'Content-Disposition: attachment;',
    ` ${ascii ? `filename=${quoted(name)}` : `filename*=UTF-8''${rfc2231(name)}`}`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(a.data),
  ].join(CRLF)
}

const textPart = (subtype: 'plain' | 'html', body: string) =>
  [`Content-Type: text/${subtype}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', base64Lines(Buffer.from(crlf(body), 'utf8'))].join(CRLF)

/** Multipart body: each part followed by the closing delimiter. */
const multipart = (b: string, parts: string[]) => parts.map(p => `--${b}${CRLF}${p}${CRLF}`).join('') + `--${b}--`

/** base64url of an RFC 5322 message: multipart/mixed > multipart/alternative (text, html) + attachments. */
export function buildRaw(m: OutgoingMessage): string {
  const mixed = boundary('mixed')
  const alt = boundary('alt')
  const headers = [
    foldHeader('From', fromTokens(m.from)),
    foldHeader('To', addressListTokens([m.to], 'to')),
    ...(m.cc.length ? [foldHeader('Cc', addressListTokens(m.cc, 'cc'))] : []),
    foldHeader('Subject', textTokens(oneLine(m.subject))),
    `Date: ${new Date().toUTCString().replace(/GMT$/, '+0000')}`,
    foldHeader('Message-ID', [oneLine(m.messageId).trim()]),
    ...(m.inReplyTo ? [foldHeader('In-Reply-To', oneLine(m.inReplyTo).trim().split(/\s+/))] : []),
    ...(m.references ? [foldHeader('References', oneLine(m.references).trim().split(/\s+/))] : []),
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ]
  const alternative = `Content-Type: multipart/alternative; boundary="${alt}"${CRLF}${CRLF}` + multipart(alt, [textPart('plain', m.text), textPart('html', m.html)])
  const body = multipart(mixed, [alternative, ...m.attachments.map(attachmentPart)])
  return Buffer.from(headers.join(CRLF) + CRLF + CRLF + body + CRLF, 'utf8').toString('base64url')
}

/** A fresh RFC 5322 Message-ID: `<random@domain>`. */
export function newMessageId(domain: string): string {
  return `<${Date.now().toString(36)}.${randomBytes(12).toString('hex')}@${oneLine(domain).trim()}>`
}
