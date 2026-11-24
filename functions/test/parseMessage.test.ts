import { describe, expect, it } from 'vitest'
import { parseMessage, type GmailMessage } from '../src/email/parseMessage.js'

const SENDER = 'team@example.com'
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
type Part = NonNullable<GmailMessage['payload']>
const h = (o: Record<string, string>) => Object.entries(o).map(([name, value]) => ({ name, value }))
const leaf = (mimeType: string, data: string, extra: Record<string, string> = {}): Part =>
  ({ mimeType, filename: '', headers: h({ 'Content-Type': `${mimeType}; charset="UTF-8"`, ...extra }), body: { size: data.length, data: b64(data) } })
const msg = (payload: Part, top: Record<string, string> = {}, labelIds = ['INBOX']): GmailMessage => ({
  id: 'm1',
  threadId: 't1',
  labelIds,
  internalDate: '1795000000000',
  payload: {
    ...payload,
    headers: [
      ...h({
        From: 'Ada Lovelace <Ada@Example.com>',
        To: 'DevFest Team <team@example.com>, "Doe, Jane" <jane@example.com>',
        Cc: 'bo@example.com',
        Subject: 'Re: Your talk',
        'Message-ID': '<reply-1@mail.example.com>',
        ...top,
      }),
      ...(payload.headers ?? []),
    ],
  },
})

describe('parseMessage', () => {
  it('plainReply', () => {
    const r = parseMessage(msg({
      mimeType: 'multipart/alternative',
      headers: h({ 'Content-Type': 'multipart/alternative; boundary="b"' }),
      parts: [
        leaf('text/plain', 'Thanks, I will be there.\r\n\r\nAda\r\n'),
        leaf('text/html', '<div>Thanks, <b>HTML</b> version</div>'),
      ],
    }), SENDER)
    expect(r).toEqual({
      kind: 'reply',
      from: 'ada@example.com',
      to: ['team@example.com', 'jane@example.com'],
      cc: ['bo@example.com'],
      subject: 'Re: Your talk',
      text: 'Thanks, I will be there.\n\nAda',
      quoted: '',
      attachments: [],
      atMs: 1795000000000,
      rfcMessageId: '<reply-1@mail.example.com>',
      bounceReason: null,
    })
  })

  it('decodes encoded-word subjects and lists attachments', () => {
    const r = parseMessage(msg({
      mimeType: 'multipart/mixed',
      headers: h({ 'Content-Type': 'multipart/mixed; boundary="m"' }),
      parts: [
        leaf('text/plain', 'Slides attached.'),
        { mimeType: 'application/pdf', filename: 'slides.pdf', headers: h({ 'Content-Type': 'application/pdf' }), body: { attachmentId: 'ATT1', size: 1234 } },
      ],
    }, { Subject: '=?UTF-8?B?' + Buffer.from('Re: Konuşma').toString('base64') + '?=' }), SENDER)
    expect(r.subject).toBe('Re: Konuşma')
    expect(r.attachments).toEqual([{ id: 'ATT1', name: 'slides.pdf', size: 1234, mimeType: 'application/pdf' }])
  })

  it('htmlOnlyReply', () => {
    const html = '<html><head><style>p{color:red}</style><script>alert(1)</script></head><body>' +
      '<div dir="ltr">Hello &amp; thanks!<br>Second line &lt;b&gt; &#351;&#x131;</div><div><br></div><p>Para</p><p></p><p></p><p>End</p>' +
      '<div class="gmail_quote"><div class="gmail_attr">On Mon, Nov 23, 2026 at 10:00 AM Team &lt;team@example.com&gt; wrote:<br></div>' +
      '<blockquote class="gmail_quote">Your talk was <i>accepted</i>.</blockquote></div></body></html>'
    const r = parseMessage(msg(leaf('text/html', html)), SENDER)
    expect(r.kind).toBe('reply')
    expect(r.text).toBe('Hello & thanks!\nSecond line <b> şı\n\nPara\n\nEnd')
    expect(r.quoted).toBe('On Mon, Nov 23, 2026 at 10:00 AM Team <team@example.com> wrote:\n\nYour talk was accepted.')
    expect(r.text + r.quoted).not.toMatch(/<(div|p|br|i|script|style)\b/)
    expect(r.text).not.toContain('alert')
  })

  it('quoteSplitEnglishAndTurkish', () => {
    const en = parseMessage(msg(leaf('text/plain', 'Sure.\n\nOn Mon, 23 Nov 2026 at 10:00, Team <team@example.com> wrote:\n> Your talk\n> was accepted')), SENDER)
    expect(en.text).toBe('Sure.')
    expect(en.quoted).toBe('On Mon, 23 Nov 2026 at 10:00, Team <team@example.com> wrote:\n> Your talk\n> was accepted')

    const tr = parseMessage(msg(leaf('text/plain', 'Tamam.\n\n23 Kas 2026 Pzt, 10:00 tarihinde Team <team@example.com> şunu yazdı:\n> Konuşmanız kabul edildi')), SENDER)
    expect(tr.text).toBe('Tamam.')
    expect(tr.quoted).toBe('23 Kas 2026 Pzt, 10:00 tarihinde Team <team@example.com> şunu yazdı:\n> Konuşmanız kabul edildi')

    const tail = parseMessage(msg(leaf('text/plain', 'Yes please.\n> earlier\n>\n> more\n')), SENDER)
    expect(tail.text).toBe('Yes please.')
    expect(tail.quoted).toBe('> earlier\n>\n> more')

    const wrapped = parseMessage(msg(leaf('text/plain', 'Fine.\n\nOn Mon, Nov 23, 2026 at 10:00 AM DevFest Team <\nteam@example.com> wrote:\n\n> Your talk')), SENDER)
    expect(wrapped.text).toBe('Fine.')
    expect(wrapped.quoted).toBe('On Mon, Nov 23, 2026 at 10:00 AM DevFest Team <\nteam@example.com> wrote:\n\n> Your talk')

    const indented = parseMessage(msg(leaf('text/plain', 'Agenda:\n  1. Intro\n    code()  \n')), SENDER)
    expect(indented.text).toBe('Agenda:\n  1. Intro\n    code()')

    const inline = parseMessage(msg(leaf('text/plain', '> question?\nanswer')), SENDER)
    expect(inline.text).toBe('> question?\nanswer')
    expect(inline.quoted).toBe('')
  })

  it('reportFromNormalSenderIsReply', () => {
    expect(parseMessage(msg(report(dsn)), SENDER).kind).toBe('reply')
    expect(parseMessage(msg(report(dsn)), SENDER).bounceReason).toBeNull()
  })

  it('htmlQuoteUsedWhenPlainHasNoMarker', () => {
    const r = parseMessage(msg({
      mimeType: 'multipart/alternative',
      headers: h({ 'Content-Type': 'multipart/alternative; boundary="b"' }),
      parts: [
        leaf('text/plain', 'Sounds good.\n\nYour talk was accepted.'),
        leaf('text/html', '<div>Sounds good.</div><div class="gmail_quote gmail_quote_container"><blockquote class="gmail_quote">Your talk was accepted.</blockquote></div>'),
      ],
    }), SENDER)
    expect(r.text).toBe('Sounds good.')
    expect(r.quoted).toBe('Your talk was accepted.')
  })

  it('bounceNeedsReport', () => {
    const r = parseMessage(msg(leaf('text/plain', 'Your account was suspended, click here.'), { From: 'Mail Delivery Subsystem <mailer-daemon@x.example.com>' }), SENDER)
    expect(r.kind).toBe('reply')
    expect(r.bounceReason).toBeNull()
  })

  const dsn = 'Reporting-MTA: dns; googlemail.com\r\n\r\nFinal-Recipient: rfc822; nobody@example.com\r\nAction: failed\r\nStatus: 5.1.1\r\nDiagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does\r\n not exist.\r\n'
  const report = (status: string): Part => ({
    mimeType: 'multipart/report',
    headers: h({ 'Content-Type': 'multipart/report; boundary="r"; report-type=delivery-status' }),
    parts: [
      leaf('text/plain', "Address not found\r\nYour message wasn't delivered to nobody@example.com."),
      { mimeType: 'message/delivery-status', filename: '', headers: h({ 'Content-Type': 'message/delivery-status' }), body: { size: status.length, data: b64(status) } },
      { mimeType: 'message/rfc822', filename: '', headers: h({ 'Content-Type': 'message/rfc822' }), body: { size: 0 }, parts: [leaf('text/plain', 'Original body')] },
    ],
  })

  it('realBounceReason', () => {
    const r = parseMessage(msg(report(dsn), { From: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>' }), SENDER)
    expect(r.kind).toBe('bounce')
    expect(r.bounceReason).toBe('smtp; 550-5.1.1 The email account that you tried to reach does not exist.')
    expect(r.text).toContain('Address not found')
    expect(r.text).not.toContain('Original body')
    expect(r.attachments).toEqual([])

    const statusOnly = parseMessage(msg(report('Final-Recipient: rfc822; nobody@example.com\r\nStatus: 5.2.2\r\n'), { From: 'MAILER-DAEMON@mx.example.com' }), SENDER)
    expect(statusOnly.kind).toBe('bounce')
    expect(statusOnly.bounceReason).toBe('5.2.2')

    // daemon From plus a delivery-status part, without the report wrapper
    const loose = report('Action: failed\r\n')
    const r3 = parseMessage(msg({ ...loose, mimeType: 'multipart/mixed', headers: h({ 'Content-Type': 'multipart/mixed; boundary="r"' }) }, { From: 'postmaster@mx.example.com' }), SENDER)
    expect(r3.kind).toBe('bounce')
    expect(r3.bounceReason).toBe("Address not found\nYour message wasn't delivered to nobody@example.com.")
  })

  it('bounceReasonFallbackSlicesCodePoints', () => {
    const p = report('Action: failed\r\n')
    p.parts![0] = leaf('text/plain', '😀'.repeat(400))
    const r = parseMessage(msg(p, { From: 'mailer-daemon@mx.example.com' }), SENDER)
    expect(r.kind).toBe('bounce')
    expect([...r.bounceReason!]).toHaveLength(300)
    expect(r.bounceReason).toBe('😀'.repeat(300))
  })

  it('teamMessageBySentLabel', () => {
    const byLabel = parseMessage(msg(leaf('text/plain', 'From Gmail'), { From: 'Other Organiser <org@example.com>' }, ['SENT']), SENDER)
    expect(byLabel.kind).toBe('team')
  })

  it('forgedSenderFromIsReply', () => {
    const forged = parseMessage(msg(leaf('text/plain', 'Please send your bank details'), { From: 'DevFest Team <Team@Example.com>' }), SENDER)
    expect(forged.kind).toBe('reply')
    expect(forged.from).toBe('team@example.com')
  })

  it('groupRelayedReplyShowsOriginalSender', () => {
    // A Google Group that rewrites From (DMARC) keeps the speaker in Reply-To.
    const viaGroup = parseMessage(msg(leaf('text/plain', 'Thanks!'), {
      From: "'Ada Lovelace' via Speakers <Team@Example.com>", 'Reply-To': 'Ada Lovelace <Ada@Example.com>',
    }), SENDER)
    expect(viaGroup.kind).toBe('reply')
    expect(viaGroup.from).toBe('ada@example.com')
    const original = parseMessage(msg(leaf('text/plain', 'Thanks!'), {
      From: "'Ada' via Speakers <team@example.com>", 'X-Original-Sender': 'ada@example.com',
    }), SENDER)
    expect(original.from).toBe('ada@example.com')
  })

  it('replyToIgnoredWhenFromIsNotTheGroup', () => {
    const r = parseMessage(msg(leaf('text/plain', 'Hi'), { 'Reply-To': 'someone@else.com' }), SENDER)
    expect(r.from).toBe('ada@example.com')
    const team = parseMessage(msg(leaf('text/plain', 'Hi'), { From: 'team@example.com', 'Reply-To': 'x@y.com' }, ['SENT']), SENDER)
    expect(team.from).toBe('team@example.com')
  })

  it('encodedLastFirstNamesDoNotSplit', () => {
    const enc = (s: string) => '=?UTF-8?B?' + Buffer.from(s).toString('base64') + '?='
    const r = parseMessage(msg(leaf('text/plain', 'Hi'), {
      From: `${enc('Yılmaz, Ayşe')} <Ayse@Example.com>`,
      To: `${enc('Öztürk, Can')} <can@example.com>, "Doe, Jane" <jane@example.com>, =?UTF-8?Q?Team,_X?= <team@example.com>`,
    }), SENDER)
    expect(r.from).toBe('ayse@example.com')
    expect(r.to).toEqual(['can@example.com', 'jane@example.com', 'team@example.com'])
  })
})
