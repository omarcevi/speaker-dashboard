import { describe, expect, it } from 'vitest'
import { buildRaw, newMessageId } from '../src/email/mime.js'

const base = {
  from: 'DevFest Team <team@example.com>',
  to: 'ada@example.com',
  cc: [] as string[],
  subject: 'Hello',
  text: 'Hi Ada,\nSee you.',
  html: '<p>Hi Ada,<br>See you.</p>',
  attachments: [] as { name: string; contentType: string; data: Buffer }[],
  messageId: '<abc@example.com>',
}

const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8')
const headerBlock = (msg: string) => msg.slice(0, msg.indexOf('\r\n\r\n'))
/** Unfolded top-level headers as [name, value] pairs. */
const headers = (msg: string) =>
  headerBlock(msg).replace(/\r\n[ \t]/g, ' ').split('\r\n').map(l => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()] as const)
const header = (msg: string, name: string) => headers(msg).find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1]
const decodeWords = (v: string) =>
  v.replace(/=\?UTF-8\?B\?([^?]*)\?=\s*/g, (_, b: string) => Buffer.from(b, 'base64').toString('utf8')).trim()

describe('buildRaw', () => {
  it('roundTripsTurkishSubject', () => {
    const subject = 'Konuşmanız kabul edildi — DevFest İstanbul 2026 için çok teşekkürler, görüşmek üzere!'
    const msg = decode(buildRaw({ ...base, subject, from: 'DevFest İstanbul <team@example.com>' }))
    const s = header(msg, 'Subject')!
    expect(s).toMatch(/^=\?UTF-8\?B\?/)
    expect(decodeWords(s)).toBe(subject)
    // every physical header line stays within 78 chars and ASCII
    for (const line of headerBlock(msg).split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(78)
      expect(/^[\x20-\x7e\t]*$/.test(line)).toBe(true)
    }
    const from = header(msg, 'From')!
    expect(from).toMatch(/<team@example\.com>$/)
    expect(decodeWords(from.replace(/<team@example\.com>$/, ''))).toBe('DevFest İstanbul')
    expect(header(msg, 'MIME-Version')).toBe('1.0')
    expect(header(msg, 'Message-ID')).toBe('<abc@example.com>')
  })

  it('keeps ASCII From names readable, quotes specials, lists bare To/Cc', () => {
    const msg = decode(buildRaw({ ...base, from: 'Doe, Jane <jane@example.com>', cc: ['bo@example.com', 'cy@example.com'] }))
    expect(header(msg, 'From')).toBe('"Doe, Jane" <jane@example.com>')
    expect(header(msg, 'To')).toBe('ada@example.com')
    expect(header(msg, 'Cc')).toBe('bo@example.com, cy@example.com')
  })

  it('rejectsInvalidAddresses', () => {
    const bad = ['', 'ada', 'a@b@example.com', 'Ada <ada@example.com>', 'ada@example.com, bo@example.com', 'ada @example.com',
      'ada@example.com\r\nBcc: x@evil.test', '<ada@example.com>', 'ada@exa"mple.com']
    for (const a of bad) {
      expect(() => buildRaw({ ...base, to: a }), a).toThrow(/Invalid to address/)
      expect(() => buildRaw({ ...base, cc: ['ok@example.com', a] }), a).toThrow(/Invalid cc address/)
    }
    for (const f of ['Team <a@b@example.com>', 'Team <team@example.com>\r\nBcc: x@evil.test', 'Team <>', 'team example.com']) {
      expect(() => buildRaw({ ...base, from: f }), f).toThrow(/Invalid from address/)
    }
    expect(() => buildRaw({ ...base, from: 'team@example.com', to: 'first.last+tag@sub.example.com' })).not.toThrow()
  })

  it('truncatesLongFilenamesKeepingExtension', () => {
    const long = 'Konuşmacı-'.repeat(40) + '.pdf'
    const emoji = '😀'.repeat(200) + '.pptx'
    const ascii = 'a'.repeat(400) + '.pdf'
    const msg = decode(buildRaw({ ...base, attachments: [long, emoji, ascii].map(name => ({ name, contentType: 'application/pdf', data: Buffer.from('x') })) }))
    for (const line of msg.split('\r\n')) expect(line.length).toBeLessThan(998)
    expect(msg).toContain(`filename="${'a'.repeat(146)}.pdf"`)
    const star = [...msg.matchAll(/filename\*=UTF-8''(\S+)/g)].map(m => decodeURIComponent(m[1]))
    expect(star).toHaveLength(2)
    expect(star[0].endsWith('.pdf') && [...star[0]].length <= 150 && star[0].startsWith('Konuşmacı-')).toBe(true)
    expect(star[1].endsWith('.pptx') && Buffer.byteLength(star[1]) <= 300).toBe(true)
  })

  it('omits Cc when empty', () => {
    expect(header(decode(buildRaw(base)), 'Cc')).toBeUndefined()
  })

  it('attachmentsAndAlternative', () => {
    const pdf = Buffer.alloc(200, 7)
    const msg = decode(buildRaw({
      ...base,
      text: 'Merhaba Ayşe\nİkinci satır',
      attachments: [
        { name: 'speaker-guide.pdf', contentType: 'application/pdf', data: pdf },
        { name: 'Konuşmacı rehberi.pdf', contentType: 'application/pdf', data: Buffer.from('x') },
      ],
    }))
    expect(msg).not.toMatch(/(^|[^\r])\n/) // CRLF only
    const mixed = /^multipart\/mixed; boundary="([^"]+)"$/.exec(header(msg, 'Content-Type')!)
    expect(mixed).not.toBeNull()
    const outer = msg.split(`--${mixed![1]}`)
    expect(outer.at(-1)!.startsWith('--')).toBe(true)
    const parts = outer.slice(1, -1)
    expect(parts).toHaveLength(3)
    const alt = /Content-Type: multipart\/alternative; boundary="([^"]+)"/.exec(parts[0])
    expect(alt).not.toBeNull()
    const inner = parts[0].split(`--${alt![1]}`).slice(1, -1)
    expect(inner).toHaveLength(2)
    expect(inner[0]).toContain('Content-Type: text/plain; charset=UTF-8')
    expect(inner[1]).toContain('Content-Type: text/html; charset=UTF-8')
    const body = (part: string) => part.slice(part.indexOf('\r\n\r\n') + 4).trim()
    expect(inner[0]).toContain('Content-Transfer-Encoding: base64')
    expect(Buffer.from(body(inner[0]), 'base64').toString('utf8')).toBe('Merhaba Ayşe\r\nİkinci satır')
    expect(Buffer.from(body(inner[1]), 'base64').toString('utf8')).toBe(base.html)

    expect(parts[1]).toContain('Content-Disposition: attachment;\r\n filename="speaker-guide.pdf"')
    expect(parts[1]).toContain('Content-Type: application/pdf')
    const lines = body(parts[1]).split('\r\n')
    expect(lines.slice(0, -1).every(l => l.length === 76)).toBe(true)
    expect(Buffer.from(lines.join(''), 'base64').equals(pdf)).toBe(true)

    expect(parts[2]).toContain("filename*=UTF-8''Konu%C5%9Fmac%C4%B1%20rehberi.pdf")
  })

  it('replyHeaders', () => {
    const msg = decode(buildRaw({ ...base, subject: 'Re: Hello', inReplyTo: '<orig@mail.example.com>', references: '<a@example.com> <orig@mail.example.com>' }))
    expect(header(msg, 'In-Reply-To')).toBe('<orig@mail.example.com>')
    expect(header(msg, 'References')).toBe('<a@example.com> <orig@mail.example.com>')
    expect(header(decode(buildRaw(base)), 'In-Reply-To')).toBeUndefined()
    expect(header(decode(buildRaw(base)), 'References')).toBeUndefined()
  })

  it('headerInjectionFolded', () => {
    const msg = decode(buildRaw({
      ...base,
      subject: 'Hi\r\nBcc: x@evil.test',
      inReplyTo: '<a@example.com>\r\nBcc: z@evil.test',
      references: '<a@example.com>\nX-Evil: 1',
    }))
    const names = headers(msg).map(([n]) => n.toLowerCase())
    expect(names).not.toContain('bcc')
    expect(names).not.toContain('x-evil')
    expect(header(msg, 'Subject')).toBe('Hi Bcc: x@evil.test')
    expect(header(msg, 'In-Reply-To')).toBe('<a@example.com> Bcc: z@evil.test')
    expect(header(msg, 'Content-Type')).toMatch(/^multipart\/mixed/)
    // CR/LF in an address is refused outright (see rejectsInvalidAddresses)
    expect(() => buildRaw({ ...base, cc: ['bo@example.com\r\n\r\nbody'] })).toThrow()
  })
})

describe('newMessageId', () => {
  it('is unique and bracketed on the domain', () => {
    const a = newMessageId('example.com')
    expect(a).toMatch(/^<[A-Za-z0-9._-]+@example\.com>$/)
    expect(newMessageId('example.com')).not.toBe(a)
  })
})
