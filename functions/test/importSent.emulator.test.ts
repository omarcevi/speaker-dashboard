import { describe, it, expect, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { EmailDoc, Status, ThreadDoc } from '../src/model.js'
import { importSent } from '../src/email/importSent.js'
import { fakeGmail, type FakeGmail } from '../src/testing/fakeGmail.js'
import { fakeSubmission } from '../src/testing/fakeSubmission.js'

const db = getFirestore(initializeApp({ projectId: 'demo-cfp' }, 'importSent'))
const admin = { uid: 'adm1', name: 'Adele' }
const T0 = Date.UTC(2026, 10, 24, 9, 0, 0)
const ADA = 'ada@example.com'
const GRACE = 'grace@example.com'
const LIN = 'lin@example.com'
const idFor = (batchId: string, speakerKey: string) =>
  `${batchId}__${createHash('sha1').update(speakerKey).digest('hex').slice(0, 12)}`

async function talk(id: string, row: number, email: string, firstName: string, status: Status) {
  await db.doc(`submissions/${id}`).set({
    ...fakeSubmission({ id, row, email, speakerKey: email, firstName, title: `Talk ${row}` }),
    removedFromSheet: false, syncedAt: Timestamp.fromMillis(T0),
  })
  if (status !== 'pending') {
    await db.doc(`reviews/${id}`).set({ status, updatedAt: Timestamp.fromMillis(T0), updatedBy: 'adm1', updatedByName: 'Adele' })
  }
}
const raw = (to: string, subject: string, body: string) => Buffer.from(
  `From: GDG Istanbul Team <speaker@example.org>\r\nTo: ${to}\r\nSubject: ${subject}\r\nMessage-ID: <${subject.length}-${to}@example.org>\r\n\r\n${body}`,
).toString('base64url')

let gmail: FakeGmail
const run = (apply: boolean) => importSent(db, gmail, { query: 'subject:x', templateId: 't-acc', actor: admin, apply, now: T0 })

describe('importSent', () => {
  beforeEach(async () => {
    await Promise.all(['submissions', 'reviews', 'scores', 'comments', 'meta', 'templates', 'emails', 'threads']
      .map(c => db.recursiveDelete(db.collection(c))))
    gmail = fakeGmail()
    await talk('row-2', 2, ADA, 'Ada', 'approved')
    await talk('row-3', 3, GRACE, 'Grace', 'approved')
    await talk('row-4', 4, LIN, 'Lin', 'pending')
    await db.doc('templates/t-acc').set({
      name: 'Acceptance', subject: 's', body: 'b', attachments: [], rule: 'acceptance', stageId: null,
      updatedAt: Timestamp.fromMillis(T0), updatedBy: 'adm1', updatedByName: 'Adele',
    })
  })

  it('dry run counts without writing; apply records a sent email and its thread, and labels it', async () => {
    const sent = await gmail.send(raw(`Ada <${ADA}>`, 'You are speaking', 'Hi Ada'))
    expect(await run(false)).toEqual({ messages: 1, imported: 1, alreadyImported: 0, alreadyEmailed: 0, notEligible: 0, noSpeaker: 0 })
    expect((await db.collection('emails').get()).size).toBe(0)
    expect(gmail.labelled).toEqual([])

    expect((await run(true)).imported).toBe(1)
    const e = (await db.doc(`emails/${idFor(`import_${sent.id}`, ADA)}`).get()).data() as EmailDoc
    expect(e).toMatchObject({
      state: 'sent', speakerKey: ADA, templateId: 't-acc', rule: 'acceptance', isDecision: true, talkIds: ['row-2'],
      subject: 'You are speaking', text: 'Hi Ada', manual: false, gmailMessageId: sent.id, threadId: sent.threadId, by: 'adm1',
    })
    const t = (await db.doc(`threads/${sent.threadId}`).get()).data() as ThreadDoc
    expect(t).toMatchObject({ speakerKey: ADA, seenIds: [sent.id], lastSnippet: 'Hi Ada' })
    expect(t.lastTeamAt!.toMillis()).toBe(e.sentAt!.toMillis())
    expect(gmail.labelled).toEqual([sent.id])
  })

  it('skips re-runs, repeat emails, ineligible speakers and unknown recipients', async () => {
    await gmail.send(raw(ADA, 'First', 'one'))
    await gmail.send(raw(ADA, 'Second copy', 'two'))
    await gmail.send(raw(LIN, 'Pending talk', 'three'))
    await gmail.send(raw('stranger@example.net', 'Not a speaker', 'four'))
    await gmail.send(raw(`${GRACE}, someone@example.net`, 'Grace', 'five'))
    expect(await run(true)).toEqual({ messages: 5, imported: 2, alreadyImported: 0, alreadyEmailed: 1, notEligible: 1, noSpeaker: 1 })
    const subjects = (await db.collection('emails').get()).docs.map(d => d.get('subject')).sort()
    expect(subjects).toEqual(['First', 'Grace'])
    expect(await run(true)).toEqual({ messages: 5, imported: 0, alreadyImported: 2, alreadyEmailed: 1, notEligible: 1, noSpeaker: 1 })
  })
})
