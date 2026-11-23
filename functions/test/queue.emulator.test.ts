import { describe, it, expect, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { EmailDoc, EmailTemplate, Status, ThreadDoc } from '../src/model.js'
import {
  cancelEmail, enqueue, markEmailed, processQueue, rescheduleEmail, resolveUnknown, type EnqueueInput,
} from '../src/email/queue.js'
import { fakeGmail, type FakeGmail } from '../src/testing/fakeGmail.js'
import { fakeSubmission } from '../src/testing/fakeSubmission.js'

const db = getFirestore(initializeApp({ projectId: 'demo-cfp' }))
const admin = { uid: 'adm1', name: 'Adele' }
const T0 = Date.UTC(2026, 10, 24, 9, 0, 0)
const MIN = 60_000
const ADA = 'ada@example.com'
const GRACE = 'grace@example.com'
const SENDER = 'speakers@example.com'

const idFor = (batchId: string, speakerKey: string) =>
  `${batchId}__${createHash('sha1').update(speakerKey).digest('hex').slice(0, 12)}`

async function talk(id: string, row: number, email: string, firstName: string, title: string, status: Status) {
  await db.doc(`submissions/${id}`).set({
    ...fakeSubmission({ id, row, email, speakerKey: email, firstName, title }),
    removedFromSheet: false, syncedAt: Timestamp.fromMillis(T0),
  })
  if (status !== 'pending') await setStatus(id, status)
}
const setStatus = (id: string, status: Status) =>
  db.doc(`reviews/${id}`).set({ status, updatedAt: Timestamp.fromMillis(T0), updatedBy: 'adm1', updatedByName: 'Adele' })

async function template(id: string, over: Partial<EmailTemplate> = {}) {
  await db.doc(`templates/${id}`).set({
    name: 'Acceptance', subject: 'Welcome {{firstName}}', body: 'Your talks:\n{{talkTitles}}\n\nVenue: {{venue}}',
    attachments: [], rule: 'acceptance', stageId: null,
    updatedAt: Timestamp.fromMillis(T0), updatedBy: 'adm1', updatedByName: 'Adele', ...over,
  })
}
const setVenue = (value: string) => db.doc('meta/event').set({
  fields: [{ key: 'venue', label: 'Venue', value }], updatedAt: Timestamp.fromMillis(T0), updatedBy: 'adm1', updatedByName: 'Adele',
})

const input = (over: Partial<EnqueueInput> = {}): EnqueueInput => ({
  batchId: 'b1', templateId: 't-acc', custom: null, speakerKeys: [ADA, GRACE], followUp: false, sendAt: null,
  includeCc: true, replyToThreadId: null, ...over,
})

const email = async (id: string) => (await db.doc(`emails/${id}`).get()).data() as EmailDoc
const rawText = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8')
const header = (raw: string, name: string) => new RegExp(`^${name}: (.*)$`, 'im').exec(rawText(raw))?.[1]
// Plain-text part of a message built by buildRaw (first base64 body).
const plainText = (raw: string) => {
  const m = /text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/.exec(rawText(raw))
  return Buffer.from(m![1].replace(/\r\n/g, ''), 'base64').toString('utf8')
}

let gmail: FakeGmail
const run = (now: number) => processQueue(db, gmail, {
  sender: SENDER, now, readAttachment: async () => Buffer.from('pdf'), sleep: async () => {}, clock: () => now,
})

describe('queue', () => {
  beforeEach(async () => {
    await Promise.all(['submissions', 'reviews', 'scores', 'comments', 'meta', 'templates', 'emails', 'threads']
      .map(c => db.recursiveDelete(db.collection(c))))
    gmail = fakeGmail()
    await talk('row-2', 2, ADA, 'Ada', 'Fake Engines', 'approved')
    await talk('row-3', 3, GRACE, 'Grace', 'Fake Compilers', 'approved')
    await template('t-acc')
    await setVenue('Hall A')
  })

  it('enqueue is idempotent per batch and speaker', async () => {
    const first = await enqueue(db, input(), admin, T0)
    expect(first.queued).toEqual([idFor('b1', ADA), idFor('b1', GRACE)])
    expect(first.skipped).toEqual([])
    const before = await email(idFor('b1', ADA))
    const again = await enqueue(db, input(), admin, T0 + MIN)
    expect(again.queued).toEqual(first.queued)
    expect((await db.collection('emails').get()).size).toBe(2)
    expect(await email(idFor('b1', ADA))).toEqual(before)

    expect(await run(T0 + MIN)).toEqual({ sent: 2, failed: 0, held: 0, unknown: 0 })
    // A retried callable after sending still creates nothing and sends nothing.
    const late = await enqueue(db, input(), admin, T0 + 2 * MIN)
    expect(late.queued).toEqual(first.queued)
    expect(await run(T0 + 2 * MIN)).toEqual({ sent: 0, failed: 0, held: 0, unknown: 0 })
    expect(gmail.sent).toHaveLength(2)
  })

  it('batch skips speakers with any prior decision', async () => {
    await template('t-acc-old', { name: 'Old acceptance' })
    expect(await markEmailed(db, { templateId: 't-acc-old', speakerKeys: [ADA], at: T0 - 60 * MIN }, admin)).toBe(1)
    const r = await enqueue(db, input(), admin, T0)
    expect(r.queued).toEqual([idFor('b1', GRACE)])
    expect(r.skipped).toEqual([{ speakerKey: ADA, reason: 'Already had a decision email' }])
    // An in-flight decision email blocks another batch too.
    const r2 = await enqueue(db, input({ batchId: 'b2', templateId: 't-acc-old' }), admin, T0)
    expect(r2.queued).toEqual([])
    expect(r2.skipped.map(s => s.speakerKey)).toEqual([ADA, GRACE])
    expect(r2.skipped[1].reason).toBe('Already has a decision email waiting to send')
    await expect(enqueue(db, input({ batchId: 'b3', followUp: true }), admin, T0)).rejects.toThrow('one speaker')
  })

  it('send now stores the rendered email', async () => {
    await enqueue(db, input({ speakerKeys: [ADA] }), admin, T0)
    const id = idFor('b1', ADA)
    expect(await email(id)).toMatchObject({
      state: 'queued', to: ADA, cc: [], subject: 'Welcome Ada', text: 'Your talks:\n• Fake Engines\n\nVenue: Hall A',
      templateId: 't-acc', templateName: 'Acceptance', rule: 'acceptance', isDecision: true, talkIds: ['row-2'],
      manual: false, by: 'adm1', byName: 'Adele', gmailMessageId: null,
    })
    // Event edits after "Send now" don't change what was previewed.
    await setVenue('Hall Z')
    expect(await run(T0 + MIN)).toEqual({ sent: 1, failed: 0, held: 0, unknown: 0 })
    const raw = gmail.sent[0].raw
    expect(header(raw, 'To')).toBe(ADA)
    expect(header(raw, 'From')).toBe(`DevFest Istanbul <${SENDER}>`)
    expect(header(raw, 'Subject')).toBe('Welcome Ada')
    expect(plainText(raw)).toContain('Venue: Hall A')
    const doc = await email(id)
    expect(doc).toMatchObject({ state: 'sent', gmailMessageId: 'fake-msg-1', threadId: 'fake-thread-1', reason: null })
    expect(doc.rfcMessageId).toBe(header(raw, 'Message-ID'))
    expect(doc.rfcMessageId).toMatch(/@example\.com>$/)
    expect(doc.sentAt!.toMillis()).toBe(T0 + MIN)
    const thread = (await db.doc('threads/fake-thread-1').get()).data() as ThreadDoc
    expect(thread).toMatchObject({ speakerKey: ADA, seenIds: ['fake-msg-1'], lastSnippet: 'Your talks:\n• Fake Engines\n\nVenue: Hall A' })
    expect(thread.firstSentAt.toMillis()).toBe(T0 + MIN)
    expect(thread.lastTeamAt!.toMillis()).toBe(T0 + MIN)
  })

  it('scheduled email renders at send time with new event value', async () => {
    const r = await enqueue(db, input({ speakerKeys: [ADA], sendAt: T0 + 60 * MIN }), admin, T0)
    const id = idFor('b1', ADA)
    expect(r.queued).toEqual([id])
    expect(await email(id)).toMatchObject({ state: 'scheduled', subject: null, text: null })
    await setVenue('Hall B')
    expect(await run(T0 + 30 * MIN)).toEqual({ sent: 0, failed: 0, held: 0, unknown: 0 })
    expect((await email(id)).state).toBe('scheduled')
    expect(await run(T0 + 61 * MIN)).toEqual({ sent: 1, failed: 0, held: 0, unknown: 0 })
    expect(await email(id)).toMatchObject({ state: 'sent', text: 'Your talks:\n• Fake Engines\n\nVenue: Hall B' })
    expect(plainText(gmail.sent[0].raw)).toContain('Venue: Hall B')
  })

  it('scheduled email is held when no longer eligible', async () => {
    await enqueue(db, input({ sendAt: T0 + 60 * MIN }), admin, T0)
    await setStatus('row-2', 'pending')
    await setVenue('')
    expect(await run(T0 + 61 * MIN)).toEqual({ sent: 0, failed: 0, held: 2, unknown: 0 })
    expect(await email(idFor('b1', ADA))).toMatchObject({ state: 'held', reason: 'Not ready: a talk is still pending or maybe' })
    expect(await email(idFor('b1', GRACE))).toMatchObject({ state: 'held', reason: 'Empty fill-in: venue', subject: null })
    expect(await run(T0 + 62 * MIN)).toEqual({ sent: 0, failed: 0, held: 0, unknown: 0 })
    expect(gmail.sent).toHaveLength(0)
  })

  it('two batches that both queued a decision email send only one', async () => {
    await enqueue(db, input({ speakerKeys: [ADA] }), admin, T0)
    // Simulates a concurrent enqueue that passed the check before the first doc existed.
    const copy = { ...(await email(idFor('b1', ADA))), batchId: 'b2' }
    await db.doc(`emails/${idFor('b2', ADA)}`).set(copy)
    // markEmailed skips a speaker whose decision email is on its way.
    expect(await markEmailed(db, { templateId: 't-acc', speakerKeys: [ADA], at: T0 }, admin)).toBe(0)
    expect(await run(T0 + MIN)).toEqual({ sent: 1, failed: 0, held: 1, unknown: 0 })
    expect(gmail.sent).toHaveLength(1)
    expect(await email(idFor('b2', ADA))).toMatchObject({ state: 'held', reason: 'Already had a decision email' })
  })

  it('parallel runs send a queued email once', async () => {
    await enqueue(db, input({ speakerKeys: [ADA] }), admin, T0)
    const results = await Promise.all([run(T0 + MIN), run(T0 + MIN)])
    expect(results.map(r => r.sent).sort()).toEqual([0, 1])
    expect(gmail.sent).toHaveLength(1)
    expect((await email(idFor('b1', ADA))).state).toBe('sent')
  }, 60_000)

  it('scheduled email is held when its template is deleted or its rule changed', async () => {
    await template('t-gone', { rule: 'approved', name: 'Gone' })
    await enqueue(db, input({ speakerKeys: [ADA], sendAt: T0 + 60 * MIN }), admin, T0)
    await enqueue(db, input({ batchId: 'b2', templateId: 't-gone', speakerKeys: [GRACE], sendAt: T0 + 60 * MIN }), admin, T0)
    await template('t-acc', { rule: 'approved' })
    await db.doc('templates/t-gone').delete()
    expect(await run(T0 + 61 * MIN)).toEqual({ sent: 0, failed: 0, held: 2, unknown: 0 })
    expect(await email(idFor('b1', ADA))).toMatchObject({ state: 'held', reason: "Template's recipients rule changed" })
    expect(await email(idFor('b2', GRACE))).toMatchObject({ state: 'held', reason: 'Template was deleted' })
    expect(gmail.sent).toHaveLength(0)
  })

  it('stale sending becomes unknown and is never sent again', async () => {
    await enqueue(db, input(), admin, T0)
    await db.doc(`emails/${idFor('b1', ADA)}`).update({ state: 'sending', claimedAt: Timestamp.fromMillis(T0 - 11 * MIN) })
    await db.doc(`emails/${idFor('b1', GRACE)}`).update({ state: 'sending', claimedAt: Timestamp.fromMillis(T0 - 5 * MIN) })
    expect(await run(T0)).toEqual({ sent: 0, failed: 0, held: 0, unknown: 1 })
    expect((await email(idFor('b1', ADA))).state).toBe('unknown')
    expect((await email(idFor('b1', GRACE))).state).toBe('sending')
    expect(await run(T0 + 10 * MIN)).toEqual({ sent: 0, failed: 0, held: 0, unknown: 1 })
    expect(await run(T0 + 20 * MIN)).toEqual({ sent: 0, failed: 0, held: 0, unknown: 0 })
    expect(gmail.sent).toHaveLength(0)

    await expect(resolveUnknown(db, idFor('b1', ADA), 'requeue', admin)).resolves.toBeUndefined()
    await resolveUnknown(db, idFor('b1', GRACE), 'sent', admin)
    expect((await email(idFor('b1', GRACE))).state).toBe('sent')
    await expect(resolveUnknown(db, idFor('b1', GRACE), 'requeue', admin)).rejects.toThrow()
    expect(await run(T0 + 21 * MIN)).toEqual({ sent: 1, failed: 0, held: 0, unknown: 0 })
    expect(gmail.sent).toHaveLength(1)
    expect(header(gmail.sent[0].raw, 'To')).toBe(ADA)
  })

  it('gmail failure marks failed', async () => {
    await enqueue(db, input({ speakerKeys: [ADA] }), admin, T0)
    gmail.failNext(new Error('Gmail send failed (500)'))
    expect(await run(T0)).toEqual({ sent: 0, failed: 1, held: 0, unknown: 0 })
    expect(await email(idFor('b1', ADA))).toMatchObject({ state: 'failed', reason: 'Gmail send failed (500)', gmailMessageId: null })
    expect(await run(T0 + MIN)).toEqual({ sent: 0, failed: 0, held: 0, unknown: 0 })
    expect(gmail.sent).toHaveLength(0)
  })

  it('attachments outside the template folder fail the email', async () => {
    const pdf = { name: 'Guide.pdf', size: 3, contentType: 'application/pdf' }
    await template('t-acc', { attachments: [{ path: 'emailAttachments/t-acc/guide.pdf', ...pdf }] })
    await template('t-bad', { attachments: [{ path: 'emailAttachments/t-acc/guide.pdf', ...pdf }], rule: 'approved' })
    await enqueue(db, input({ speakerKeys: [ADA] }), admin, T0)
    await enqueue(db, input({ batchId: 'b2', templateId: 't-bad', speakerKeys: [GRACE] }), admin, T0)
    expect(await run(T0)).toEqual({ sent: 1, failed: 1, held: 0, unknown: 0 })
    expect(rawText(gmail.sent[0].raw)).toContain('filename="Guide.pdf"')
    expect(await email(idFor('b2', GRACE))).toMatchObject({ state: 'failed', reason: 'Attachment not allowed' })
  })

  it('cancel only before sending', async () => {
    await enqueue(db, input({ sendAt: T0 + 60 * MIN }), admin, T0)
    await rescheduleEmail(db, idFor('b1', GRACE), T0 + 120 * MIN, admin)
    expect((await email(idFor('b1', GRACE))).sendAt.toMillis()).toBe(T0 + 120 * MIN)
    await cancelEmail(db, idFor('b1', ADA), admin)
    expect((await email(idFor('b1', ADA))).state).toBe('cancelled')
    await expect(rescheduleEmail(db, idFor('b1', ADA), T0 + 90 * MIN, admin)).rejects.toThrow()
    expect(await run(T0 + 121 * MIN)).toEqual({ sent: 1, failed: 0, held: 0, unknown: 0 })
    await expect(cancelEmail(db, idFor('b1', GRACE), admin)).rejects.toThrow('only before sending')
    expect((await email(idFor('b1', GRACE))).state).toBe('sent')
    expect(gmail.sent).toHaveLength(1)
    expect(header(gmail.sent[0].raw, 'To')).toBe(GRACE)
  })

  it('mark emailed in bulk blocks later batches', async () => {
    await talk('row-4', 4, ADA, 'Ada', 'Fake Declined Talk', 'declined')
    expect(await markEmailed(db, { templateId: 't-acc', speakerKeys: [ADA, GRACE], at: T0 - 60 * MIN }, admin)).toBe(2)
    expect(await markEmailed(db, { templateId: 't-acc', speakerKeys: [ADA, GRACE], at: T0 - 60 * MIN }, admin)).toBe(0)
    const docs = (await db.collection('emails').get()).docs.map(d => d.data() as EmailDoc)
    expect(docs).toHaveLength(2)
    const ada = docs.find(d => d.speakerKey === ADA)!
    expect(ada).toMatchObject({ state: 'sent', manual: true, talkIds: ['row-2'], subject: null, text: null, isDecision: true })
    expect(ada.sentAt!.toMillis()).toBe(T0 - 60 * MIN)
    const r = await enqueue(db, input(), admin, T0)
    expect(r.queued).toEqual([])
    expect(r.skipped.map(s => s.reason)).toEqual(['Already had a decision email', 'Already had a decision email'])
    expect(gmail.sent).toHaveLength(0)
  })

  it('custom email needs a subject unless it is a reply', async () => {
    const r = await enqueue(db, input({ templateId: null, custom: { subject: ' ', body: 'Hi {{firstName}}' } }), admin, T0)
    expect(r.queued).toEqual([])
    expect(r.skipped).toEqual([
      { speakerKey: ADA, reason: 'A custom email needs a subject' }, { speakerKey: GRACE, reason: 'A custom email needs a subject' },
    ])
  })

  it('reply goes to the same thread', async () => {
    await enqueue(db, input({ speakerKeys: [ADA] }), admin, T0)
    await run(T0)
    const firstId = header(gmail.sent[0].raw, 'Message-ID')
    const r = await enqueue(db, input({
      batchId: 'reply1', templateId: null, custom: { subject: '', body: 'Thanks {{firstName}}, see you there.' },
      speakerKeys: [ADA], replyToThreadId: 'fake-thread-1',
    }), admin, T0 + MIN)
    const id = idFor('reply1', ADA)
    expect(r.queued).toEqual([id])
    expect(await email(id)).toMatchObject({
      state: 'queued', threadId: 'fake-thread-1', replyToThreadId: 'fake-thread-1', subject: 'Re: Welcome Ada',
      text: 'Thanks Ada, see you there.', templateId: null, templateName: 'Custom email', rule: 'anyone', isDecision: false,
    })
    expect(await run(T0 + 2 * MIN)).toEqual({ sent: 1, failed: 0, held: 0, unknown: 0 })
    expect(gmail.sent[1].threadId).toBe('fake-thread-1')
    expect(header(gmail.sent[1].raw, 'In-Reply-To')).toBe(firstId)
    expect(header(gmail.sent[1].raw, 'References')).toBe(firstId)
    expect(header(gmail.sent[1].raw, 'Subject')).toBe('Re: Welcome Ada')
    expect(await email(id)).toMatchObject({ state: 'sent', threadId: 'fake-thread-1', gmailMessageId: 'fake-msg-2' })
    const thread = (await db.doc('threads/fake-thread-1').get()).data() as ThreadDoc
    expect(thread.seenIds).toEqual(['fake-msg-1', 'fake-msg-2'])
    expect(thread.firstSentAt.toMillis()).toBe(T0)
    expect(thread.lastTeamAt!.toMillis()).toBe(T0 + 2 * MIN)
    expect(thread.lastSnippet).toBe('Thanks Ada, see you there.')
    await expect(enqueue(db, input({
      batchId: 'reply2', templateId: null, custom: { subject: '', body: 'Hi' }, speakerKeys: [GRACE], replyToThreadId: 'fake-thread-1',
    }), admin, T0)).rejects.toThrow()
  })
})
