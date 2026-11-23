import { describe, it, expect, beforeEach } from 'vitest'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { EmailDoc, MailMeta, ReceivedMessage, ThreadDoc } from '../src/model.js'
import type { GmailClient } from '../src/email/gmail.js'
import type { GmailMessage } from '../src/email/parseMessage.js'
import { attachmentFor, pollMail } from '../src/email/pollMail.js'
import { fakeGmail, type FakeGmail } from '../src/testing/fakeGmail.js'

const db = getFirestore(initializeApp({ projectId: 'demo-cfp' }))
const T0 = Date.UTC(2026, 10, 24, 9, 0, 0)
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const SENDER = 'speakers@example.com'
const ADA = 'ada@example.com'

const b64 = (s: string) => Buffer.from(s).toString('base64url')
const headers = (o: { from: string; to?: string; subject?: string; contentType?: string }) => [
  { name: 'From', value: o.from },
  { name: 'To', value: o.to ?? SENDER },
  { name: 'Subject', value: o.subject ?? 'Re: Welcome Ada' },
  { name: 'Message-ID', value: `<${Math.random().toString(36).slice(2)}@example.com>` },
  ...(o.contentType ? [{ name: 'Content-Type', value: o.contentType }] : []),
]

function textMessage(id: string, threadId: string, o: {
  from: string; text: string; at: number; sent?: boolean; attachment?: { id: string; name: string; mimeType: string }
}): GmailMessage {
  const textPart = { mimeType: 'text/plain', headers: [], body: { data: b64(o.text) } }
  const payload = o.attachment
    ? {
        mimeType: 'multipart/mixed', headers: headers({ from: o.from }),
        parts: [textPart, { mimeType: o.attachment.mimeType, filename: o.attachment.name, headers: [], body: { attachmentId: o.attachment.id, size: 3 } }],
      }
    : { mimeType: 'text/plain', headers: headers({ from: o.from }), body: { data: b64(o.text) } }
  return { id, threadId, labelIds: o.sent ? ['SENT'] : ['INBOX'], internalDate: String(o.at), payload }
}

function bounceMessage(id: string, threadId: string, at: number): GmailMessage {
  return {
    id, threadId, labelIds: ['INBOX'], internalDate: String(at),
    payload: {
      mimeType: 'multipart/report',
      headers: headers({ from: 'Mail Delivery Subsystem <mailer-daemon@example.com>', subject: 'Delivery Status Notification (Failure)',
        contentType: 'multipart/report; report-type=delivery-status; boundary="b1"' }),
      parts: [
        { mimeType: 'text/plain', headers: [], body: { data: b64("Your message wasn't delivered to ada@example.com.") } },
        { mimeType: 'message/delivery-status', headers: [], body: { data: b64('Status: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 User unknown') } },
      ],
    },
  }
}

async function sentEmail(id: string, threadId: string, gmailMessageId: string, sentAt: number) {
  const doc: EmailDoc = {
    batchId: 'b1', speakerKey: ADA, to: ADA, cc: [], templateId: 't-acc', templateName: 'Acceptance', rule: 'acceptance',
    isDecision: true, talkIds: ['row-2'], subject: 'Welcome Ada', text: 'Hello Ada', attachments: [],
    sendAt: Timestamp.fromMillis(sentAt), state: 'sent', reason: null, manual: false, replyToThreadId: null, gmailMessageId,
    threadId, rfcMessageId: `<${gmailMessageId}@example.com>`, claimedAt: Timestamp.fromMillis(sentAt),
    sentAt: Timestamp.fromMillis(sentAt), bounce: null, replyCount: 0, lastReplyAt: null, by: 'adm1', byName: 'Adele',
    createdAt: Timestamp.fromMillis(sentAt),
  }
  await db.doc(`emails/${id}`).set(doc)
}

async function thread(threadId: string, firstSentAt: number, seenIds: string[]) {
  const doc: ThreadDoc = {
    speakerKey: ADA, firstSentAt: Timestamp.fromMillis(firstSentAt), lastCheckedAt: null, seenIds, lastReplyAt: null,
    lastTeamAt: Timestamp.fromMillis(firstSentAt), lastSnippet: 'Hello Ada',
  }
  await db.doc(`threads/${threadId}`).set(doc)
}

const email = async (id: string) => (await db.doc(`emails/${id}`).get()).data() as EmailDoc
const threadDoc = async (id: string) => (await db.doc(`threads/${id}`).get()).data() as ThreadDoc
const messages = async (threadId: string) =>
  Object.fromEntries((await db.collection(`threads/${threadId}/messages`).get()).docs.map(d => [d.id, d.data() as ReceivedMessage]))
const meta = async () => (await db.doc('meta/mail').get()).data() as MailMeta

let gmail: FakeGmail
const poll = (now: number, client: GmailClient = gmail) => pollMail(db, client, { sender: SENDER, now })

describe('pollMail', () => {
  beforeEach(async () => {
    await Promise.all(['meta', 'emails', 'threads'].map(c => db.recursiveDelete(db.collection(c))))
    gmail = fakeGmail()
    await sentEmail('e1', 'th-1', 'g-sent-1', T0)
    await thread('th-1', T0, ['g-sent-1'])
    gmail.addReply('th-1', textMessage('g-sent-1', 'th-1', { from: SENDER, text: 'Hello Ada', at: T0, sent: true }))
  })

  it('stores a reply once across two polls', async () => {
    gmail.addReply('th-1', textMessage('g-r1', 'th-1', {
      from: `Ada Example <${ADA}>`, text: `Thanks, see you there!\n\nOn Mon, 24 Nov 2026 at 12:00, DevFest wrote:\n> Hello Ada`, at: T0 + HOUR,
    }))
    expect(await poll(T0 + 2 * HOUR)).toEqual({ threads: 1, replies: 1, bounces: 0 })

    const stored = await messages('th-1')
    expect(Object.keys(stored)).toEqual(['g-r1'])
    expect(stored['g-r1']).toEqual({
      kind: 'reply', from: ADA, to: [SENDER], cc: [], at: Timestamp.fromMillis(T0 + HOUR), subject: 'Re: Welcome Ada',
      text: 'Thanks, see you there!', quoted: 'On Mon, 24 Nov 2026 at 12:00, DevFest wrote:\n> Hello Ada', attachments: [],
    })
    const e = await email('e1')
    expect(e.replyCount).toBe(1)
    expect(e.lastReplyAt!.toMillis()).toBe(T0 + HOUR)
    const t = await threadDoc('th-1')
    expect(t.seenIds.sort()).toEqual(['g-r1', 'g-sent-1'])
    expect(t.lastReplyAt!.toMillis()).toBe(T0 + HOUR)
    expect(t.lastTeamAt!.toMillis()).toBe(T0)
    expect(t.lastSnippet).toBe('Thanks, see you there!')
    expect(t.lastCheckedAt!.toMillis()).toBe(T0 + 2 * HOUR)
    expect(await meta()).toMatchObject({ error: null })
    expect((await meta()).lastPollAt!.toMillis()).toBe(T0 + 2 * HOUR)

    expect(await poll(T0 + 3 * HOUR)).toEqual({ threads: 1, replies: 0, bounces: 0 })
    expect(Object.keys(await messages('th-1'))).toEqual(['g-r1'])
    expect((await email('e1')).replyCount).toBe(1)
    expect((await threadDoc('th-1')).lastCheckedAt!.toMillis()).toBe(T0 + 3 * HOUR)
  })

  it('bounce flags the email', async () => {
    // A second email later in the same thread: the bounce belongs to the one sent before it.
    await sentEmail('e2', 'th-1', 'g-sent-2', T0 + 2 * HOUR)
    await db.doc('threads/th-1').update({ seenIds: ['g-sent-1', 'g-sent-2'] })
    gmail.addReply('th-1', bounceMessage('g-b1', 'th-1', T0 + MIN))
    gmail.addReply('th-1', textMessage('g-sent-2', 'th-1', { from: SENDER, text: 'Reminder', at: T0 + 2 * HOUR, sent: true }))

    expect(await poll(T0 + 3 * HOUR)).toEqual({ threads: 1, replies: 0, bounces: 1 })
    const e1 = await email('e1')
    expect(e1.bounce!.reason).toBe('smtp; 550 5.1.1 User unknown')
    expect(e1.bounce!.at.toMillis()).toBe(T0 + MIN)
    expect(e1.replyCount).toBe(0)
    expect((await email('e2')).bounce).toBeNull()
    const stored = await messages('th-1')
    expect(Object.keys(stored)).toEqual(['g-b1'])
    expect(stored['g-b1'].kind).toBe('bounce')
    expect(stored['g-b1']).not.toHaveProperty('bounceReason')
    expect(stored['g-b1']).not.toHaveProperty('atMs')
    expect(stored['g-b1']).not.toHaveProperty('rfcMessageId')
    const t = await threadDoc('th-1')
    expect(t.lastReplyAt).toBeNull()
    expect(t.seenIds.sort()).toEqual(['g-b1', 'g-sent-1', 'g-sent-2'])
  })

  it('team reply stored without counting', async () => {
    // Sent by the dashboard but not yet in seenIds: recognised by the email's gmailMessageId, not stored.
    await sentEmail('e2', 'th-1', 'g-sent-2', T0 + HOUR)
    gmail.addReply('th-1', textMessage('g-sent-2', 'th-1', { from: SENDER, text: 'Reminder', at: T0 + HOUR, sent: true }))
    gmail.addReply('th-1', textMessage('g-team-1', 'th-1', {
      from: `Grace Team <${SENDER}>`, text: 'Adding the room number: B2.', at: T0 + 2 * HOUR, sent: true,
    }))

    expect(await poll(T0 + 3 * HOUR)).toEqual({ threads: 1, replies: 0, bounces: 0 })
    const stored = await messages('th-1')
    expect(Object.keys(stored)).toEqual(['g-team-1'])
    expect(stored['g-team-1']).toMatchObject({ kind: 'team', text: 'Adding the room number: B2.' })
    expect((await email('e1')).replyCount).toBe(0)
    expect((await email('e2')).replyCount).toBe(0)
    const t = await threadDoc('th-1')
    expect(t.lastTeamAt!.toMillis()).toBe(T0 + 2 * HOUR)
    expect(t.lastReplyAt).toBeNull()
    expect(t.lastSnippet).toBe('Adding the room number: B2.')
    expect(t.seenIds.sort()).toEqual(['g-sent-1', 'g-sent-2', 'g-team-1'])
  })

  it('old threads not polled', async () => {
    // th-1 was first sent at T0, 91 days before `now`; th-new 89 days before.
    const now = T0 + 91 * DAY
    await sentEmail('e-new', 'th-new', 'g-new', T0 + 2 * DAY)
    await thread('th-new', T0 + 2 * DAY, ['g-new'])
    gmail.addReply('th-new', textMessage('g-new-r', 'th-new', { from: ADA, text: 'Recent reply', at: now - HOUR }))
    gmail.addReply('th-1', textMessage('g-r1', 'th-1', { from: ADA, text: 'Late reply', at: now - HOUR }))

    expect(await poll(now)).toEqual({ threads: 1, replies: 1, bounces: 0 })
    expect(Object.keys(await messages('th-new'))).toEqual(['g-new-r'])
    expect(await messages('th-1')).toEqual({})
    expect((await threadDoc('th-1')).lastCheckedAt).toBeNull()
    expect((await email('e1')).replyCount).toBe(0)
  })

  it('a thread that cannot be read does not stop the others', async () => {
    await sentEmail('e2', 'th-2', 'g-sent-2', T0)
    await thread('th-2', T0, ['g-sent-2'])
    gmail.addReply('th-2', textMessage('g-r2', 'th-2', { from: ADA, text: 'Reply two', at: T0 + HOUR }))
    const failing: GmailClient = {
      ...gmail,
      async getThread(id) {
        if (id === 'th-1') throw new Error('Gmail getThread failed (500)')
        return gmail.getThread(id)
      },
    }
    expect(await poll(T0 + 2 * HOUR, failing)).toEqual({ threads: 2, replies: 1, bounces: 0 })
    expect(Object.keys(await messages('th-2'))).toEqual(['g-r2'])
    expect((await meta()).error).toBe('1 threads could not be read')
    expect((await threadDoc('th-1')).lastCheckedAt).toBeNull()

    await poll(T0 + 3 * HOUR)
    expect((await meta()).error).toBeNull()
  })

  it('attachment only for stored ids', async () => {
    gmail.addReply('th-1', textMessage('g-r1', 'th-1', {
      from: ADA, text: 'Slides attached', at: T0 + HOUR, attachment: { id: 'att-1', name: 'slides.pdf', mimeType: 'application/pdf' },
    }))
    const client: GmailClient = { ...gmail, getAttachment: async (m, a) => Buffer.from(`${m}/${a}`) }
    await poll(T0 + 2 * HOUR, client)
    expect((await messages('th-1'))['g-r1'].attachments).toEqual([{ id: 'att-1', name: 'slides.pdf', size: 3, mimeType: 'application/pdf' }])

    const got = await attachmentFor(db, client, 'th-1', 'g-r1', 'att-1')
    expect(got).toEqual({ name: 'slides.pdf', mimeType: 'application/pdf', data: Buffer.from('g-r1/att-1') })
    await expect(attachmentFor(db, client, 'th-1', 'g-r1', 'att-2')).rejects.toThrow('not found')
    await expect(attachmentFor(db, client, 'th-1', 'g-sent-1', 'att-1')).rejects.toThrow('not found')
    await expect(attachmentFor(db, client, 'th-2', 'g-r1', 'att-1')).rejects.toThrow('not found')
    await expect(attachmentFor(db, client, 'th-1/messages', 'g-r1', 'att-1')).rejects.toThrow('not found')
  })
})
