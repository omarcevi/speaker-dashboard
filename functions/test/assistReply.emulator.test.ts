import { describe, it, expect, beforeEach } from 'vitest'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { EmailDoc, ReceivedMessage, ThreadDoc } from '../src/model.js'
import type { DecisionInput, ReplyAi } from '../src/ai/replyAi.js'
import { assistReply, buildDraftInput, draftReply, replyErrorCode, ReplyNotFound } from '../src/email/assistReply.js'
import { fakeReplyAi } from '../src/testing/fakeReplyAi.js'
import { fakeSubmission } from '../src/testing/fakeSubmission.js'

const db = getFirestore(initializeApp({ projectId: 'demo-cfp' }))
const T0 = Date.UTC(2026, 10, 24, 9, 0, 0)
const MIN = 60_000
const ADA = 'ada@example.com'
const ts = (ms: number) => Timestamp.fromMillis(ms)

async function talk(id: string, row: number, title: string, approved: boolean) {
  await db.doc(`submissions/${id}`).set({
    ...fakeSubmission({ id, row, email: ADA, speakerKey: ADA, firstName: 'Ada', title }),
    removedFromSheet: false, syncedAt: ts(T0),
  })
  if (approved) await db.doc(`reviews/${id}`).set({ status: 'approved', updatedAt: ts(T0), updatedBy: 'adm1', updatedByName: 'Adele' })
}

async function sentEmail(id: string, threadId: string, at: number, subject: string, text: string) {
  const doc: EmailDoc = {
    batchId: 'b1', speakerKey: ADA, to: ADA, cc: [], templateId: 't-acc', templateName: 'Acceptance', rule: 'acceptance',
    isDecision: true, talkIds: ['row-2'], subject, text, html: null, attachments: [],
    sendAt: ts(at), state: 'sent', reason: null, manual: false, replyToThreadId: null, gmailMessageId: `g-${id}`,
    threadId, rfcMessageId: `<g-${id}@example.com>`, claimedAt: ts(at),
    sentAt: ts(at), bounce: null, replyCount: 0, lastReplyAt: null, by: 'adm1', byName: 'Adele', createdAt: ts(at),
  }
  await db.doc(`emails/${id}`).set(doc)
}

async function message(threadId: string, id: string, kind: ReceivedMessage['kind'], at: number, text: string, subject = 'Re: Welcome Ada') {
  const doc: ReceivedMessage = {
    kind, from: kind === 'reply' ? ADA : 'speakers@example.com', to: [], cc: [], at: ts(at), subject, text, quoted: '> old',
    attachments: [],
  }
  await db.doc(`threads/${threadId}/messages/${id}`).set(doc)
}

async function thread(threadId: string, over: Partial<ThreadDoc> = {}) {
  const doc: ThreadDoc = {
    speakerKey: ADA, firstSentAt: ts(T0), lastCheckedAt: null, seenIds: [], lastReplyAt: ts(T0 + 10 * MIN),
    lastTeamAt: ts(T0), lastSnippet: 'x', lastReplyId: 'm1', ...over,
  }
  await db.doc(`threads/${threadId}`).set(doc)
}

const threadDoc = async (id = 'th-1') => (await db.doc(`threads/${id}`).get()).data() as ThreadDoc
const run = (ai: ReplyAi, messageId = 'm1') => assistReply(db, ai, { threadId: 'th-1', messageId, now: T0 + 20 * MIN })

/** Seeds th-1 with the acceptance email and a reply m1 with the given text. */
async function withReply(text: string) {
  await message('th-1', 'm1', 'reply', T0 + 10 * MIN, text)
}

describe('assistReply', () => {
  beforeEach(async () => {
    await Promise.all(['submissions', 'reviews', 'scores', 'comments', 'meta', 'templates', 'emails', 'threads']
      .map(c => db.recursiveDelete(db.collection(c))))
    await talk('row-2', 2, 'Fake Engines', true)
    await talk('row-3', 3, 'Rejected Talk', false)
    await db.doc('meta/event').set({
      fields: [{ key: 'venue', label: 'Venue', value: 'Hall A' }], speakerFacts: 'Doors open at 9.',
      updatedAt: ts(T0), updatedBy: 'adm1', updatedByName: 'Adele',
    })
    await db.doc('templates/t-acc').set({
      name: 'Acceptance', subject: 'Welcome {{firstName}}', body: 'Your talks:\n{{talkTitles}}', attachments: [],
      rule: 'acceptance', stageId: null, updatedAt: ts(T0), updatedBy: 'adm1', updatedByName: 'Adele',
    })
    await sentEmail('e1', 'th-1', T0, 'Welcome Ada', 'Hello Ada, you are in.')
    await thread('th-1')
  })

  it('auto-clears a thank-you', async () => {
    await withReply('Many thanks!')
    const ai = fakeReplyAi()
    expect(await run(ai)).toBe('cleared')
    const t = await threadDoc()
    expect(t.ai).toMatchObject({ messageId: 'm1', label: 'no_answer_needed', model: 'fake-decision', error: null })
    expect(t.ai!.probabilities!.no_answer_needed).toBeCloseTo(0.97)
    expect(t.ai!.at.toMillis()).toBe(T0 + 20 * MIN)
    expect(t.settled).toMatchObject({ messageId: 'm1', by: 'ai', byName: 'AI' })
    expect(t.draft).toBeUndefined()
    expect(ai.calls.draft).toBe(0)
  })

  it('drafts an answer to a question', async () => {
    await withReply('Can I bring my laptop?')
    const ai = fakeReplyAi()
    expect(await run(ai)).toBe('drafted')
    const t = await threadDoc()
    expect(t.ai).toMatchObject({ messageId: 'm1', label: 'needs_answer' })
    expect(t.draft).toMatchObject({ messageId: 'm1', text: 'Hi Ada, [fake draft]', model: 'fake-draft' })
    expect(t.settled).toBeUndefined()
  })

  it('flags a withdrawal without a draft', async () => {
    await withReply('Sorry, I have to withdraw')
    expect(await run(fakeReplyAi())).toBe('flagged')
    const t = await threadDoc()
    expect(t.ai).toMatchObject({ messageId: 'm1', label: 'withdrawing' })
    expect(t.draft).toBeUndefined()
    expect(t.settled).toBeUndefined()
  })

  it('passes the reply, its quote and the newest earlier team text to the decision', async () => {
    await message('th-1', 'm0', 'team', T0 + 5 * MIN, 'We also have a speaker dinner.', 'Re: Welcome Ada (dinner)')
    await sentEmail('e2', 'th-1', T0 + 30 * MIN, 'Later', 'After the reply')
    await withReply('Can I bring my laptop?')
    const base = fakeReplyAi()
    let seen: DecisionInput | undefined
    const ai: ReplyAi = { ...base, decide: async (i) => { seen = i; return base.decide(i) } }
    await run(ai)
    expect(seen).toEqual({
      reply: 'Can I bring my laptop?', quoted: '> old',
      previousTeam: { subject: 'Re: Welcome Ada (dinner)', text: 'We also have a speaker dinner.' },
      earlier: [],
    })
  })

  it('uses a sent email as the previous team text', async () => {
    await withReply('Can I bring my laptop?')
    const base = fakeReplyAi()
    let seen: DecisionInput | undefined
    await run({ ...base, decide: async (i) => { seen = i; return base.decide(i) } })
    expect(seen!.previousTeam).toEqual({ subject: 'Welcome Ada', text: 'Hello Ada, you are in.' })
  })

  it('never clears a thank-you that follows an unanswered question', async () => {
    await message('th-1', 'm0', 'reply', T0 + 5 * MIN, 'Can I bring my laptop?')
    await withReply('Many thanks!')
    const base = fakeReplyAi()
    let seen: DecisionInput | undefined
    const result = await run({ ...base, decide: async (i) => { seen = i; return base.decide(i) } })
    expect(result).not.toBe('cleared')
    expect(seen!.earlier).toEqual(['Can I bring my laptop?'])
    const t = await threadDoc()
    expect(t.ai).toMatchObject({ messageId: 'm1', label: 'no_answer_needed' })
    expect(t.settled).toBeUndefined()
  })

  it('never clears a thank-you that follows an unanswered withdrawal', async () => {
    await message('th-1', 'm0', 'reply', T0 + 5 * MIN, 'Sorry, I have to withdraw')
    await withReply('Many thanks!')
    expect(await run(fakeReplyAi())).not.toBe('cleared')
    expect((await threadDoc()).settled).toBeUndefined()
  })

  it('still clears a single thank-you after the team answered an earlier reply', async () => {
    await message('th-1', 'm0', 'reply', T0 + 2 * MIN, 'Can I bring my laptop?')
    await message('th-1', 'mt', 'team', T0 + 5 * MIN, 'Yes you can.')
    await withReply('Many thanks!')
    const base = fakeReplyAi()
    let seen: DecisionInput | undefined
    expect(await run({ ...base, decide: async (i) => { seen = i; return base.decide(i) } })).toBe('cleared')
    expect(seen!.earlier).toEqual([])
    expect((await threadDoc()).settled).toMatchObject({ messageId: 'm1', by: 'ai' })
  })

  it('skips a reply that is not the newest', async () => {
    await message('th-1', 'm0', 'reply', T0 + 5 * MIN, 'thanks')
    await withReply('Can I bring my laptop?')
    const ai = fakeReplyAi()
    expect(await run(ai, 'm0')).toBe('stale')
    expect(ai.calls.decide).toBe(0)
    const t = await threadDoc()
    expect(t.ai).toBeUndefined()
    expect(t.draft).toBeUndefined()
    expect(t.settled).toBeUndefined()
  })

  it('writes nothing when a newer reply arrives during the decision', async () => {
    await withReply('Many thanks!')
    const base = fakeReplyAi()
    const ai: ReplyAi = {
      ...base,
      decide: async (i) => {
        const r = await base.decide(i)
        await db.doc('threads/th-1').update({ lastReplyId: 'm2' })
        return r
      },
    }
    expect(await run(ai)).toBe('stale')
    const t = await threadDoc()
    expect(t.lastReplyId).toBe('m2')
    expect(t.ai).toBeUndefined()
    expect(t.settled).toBeUndefined()
  })

  it('records a failed decision as a code and does not throw', async () => {
    await withReply('Can I boom?')
    const ai = fakeReplyAi({ fail: new Set(['boom']) })
    expect(await run(ai)).toBe('failed')
    const t = await threadDoc()
    expect(t.ai).toMatchObject({ messageId: 'm1', label: null, probabilities: null, confidence: null, error: 'unknown' })
    expect(t.settled).toBeUndefined()
    expect(t.draft).toBeUndefined()
  })

  it('keeps the reading but no draft when the draft fails', async () => {
    await db.doc('meta/event').update({ speakerFacts: 'FAILDRAFT' })
    await withReply('Can I bring my laptop?')
    expect(await run(fakeReplyAi({ fail: new Set(['FAILDRAFT']) }))).toBe('flagged')
    const t = await threadDoc()
    expect(t.ai).toMatchObject({ messageId: 'm1', label: 'needs_answer', error: null })
    expect(t.draft).toBeUndefined()
  })

  it('never overwrites an admin settling the same reply', async () => {
    await thread('th-1', { settled: { messageId: 'm1', by: 'adm1', byName: 'Adele', at: ts(T0 + 15 * MIN) } })
    await withReply('Many thanks!')
    await run(fakeReplyAi())
    const t = await threadDoc()
    expect(t.settled).toMatchObject({ messageId: 'm1', by: 'adm1', byName: 'Adele' })
    expect(t.ai).toMatchObject({ messageId: 'm1', label: 'no_answer_needed' })
  })

  it('replaces a settled mark for an older reply', async () => {
    await thread('th-1', { settled: { messageId: 'm0', by: 'adm1', byName: 'Adele', at: ts(T0) } })
    await withReply('Many thanks!')
    expect(await run(fakeReplyAi())).toBe('cleared')
    expect((await threadDoc()).settled).toMatchObject({ messageId: 'm1', by: 'ai' })
  })

  it('does not assess the same reply twice', async () => {
    await withReply('Many thanks!')
    await run(fakeReplyAi())
    await db.doc('threads/th-1').update({ settled: null }) // an admin's Undo
    const ai = fakeReplyAi()
    expect(await run(ai)).toBe('stale')
    expect(ai.calls.decide).toBe(0)
    expect((await threadDoc()).settled).toBeNull()
  })
})

describe('draftReply', () => {
  beforeEach(async () => {
    await Promise.all(['submissions', 'reviews', 'scores', 'comments', 'meta', 'templates', 'emails', 'threads']
      .map(c => db.recursiveDelete(db.collection(c))))
    await talk('row-2', 2, 'Fake Engines', true)
    await sentEmail('e1', 'th-1', T0, 'Welcome Ada', 'Hello Ada, you are in.')
    await thread('th-1')
  })

  it('drafts for the newest reply whatever its label', async () => {
    await withReply('I have to withdraw')
    const ai = fakeReplyAi()
    expect(await draftReply(db, ai, { threadId: 'th-1', now: T0 + 30 * MIN })).toEqual({ ok: true })
    const t = await threadDoc()
    expect(t.draft).toMatchObject({ messageId: 'm1', text: 'Hi Ada, [fake draft]', model: 'fake-draft' })
    expect(t.draft!.at.toMillis()).toBe(T0 + 30 * MIN)
    expect(t.drafting).toBeNull()
  })

  it('clears drafting when the draft fails', async () => {
    await withReply('I have to withdraw')
    await expect(draftReply(db, fakeReplyAi({ fail: new Set(['withdraw']) }), { threadId: 'th-1', now: T0 })).rejects.toThrow()
    const t = await threadDoc()
    expect(t.drafting).toBeNull()
    expect(t.draft).toBeUndefined()
  })

  it('rethrows the draft error even when clearing drafting fails too', async () => {
    await withReply('Can I bring my laptop?')
    const boom = new Error('draft boom')
    const ai: ReplyAi = { ...fakeReplyAi(), draft: async () => { await db.doc('threads/th-1').delete(); throw boom } }
    await expect(draftReply(db, ai, { threadId: 'th-1', now: T0 })).rejects.toBe(boom)
  })

  it('refuses a thread without a reply', async () => {
    await db.doc('threads/th-1').update({ lastReplyId: FieldValue.delete() })
    await expect(draftReply(db, fakeReplyAi(), { threadId: 'th-1', now: T0 })).rejects.toBeInstanceOf(ReplyNotFound)
    await expect(draftReply(db, fakeReplyAi(), { threadId: 'nope', now: T0 })).rejects.toBeInstanceOf(ReplyNotFound)
  })
})

describe('buildDraftInput', () => {
  beforeEach(async () => {
    await Promise.all(['submissions', 'reviews', 'scores', 'comments', 'meta', 'templates', 'emails', 'threads']
      .map(c => db.recursiveDelete(db.collection(c))))
    await talk('row-2', 2, 'Fake Engines', true)
    await talk('row-3', 3, 'Rejected Talk', false)
    await db.doc('meta/event').set({
      fields: [{ key: 'venue', label: 'Venue', value: 'Hall A' }], speakerFacts: 'Doors open at 9.',
      updatedAt: ts(T0), updatedBy: 'adm1', updatedByName: 'Adele',
    })
    await db.doc('templates/t-acc').set({
      name: 'Acceptance', subject: 'Welcome', body: 'Plain body', attachments: [],
      rule: 'acceptance', stageId: null, updatedAt: ts(T0), updatedBy: 'adm1', updatedByName: 'Adele',
    })
    await db.doc('templates/t-html').set({
      name: 'Logistics', subject: 'Logistics', body: 'old body', html: '<p>Rich <b>text</b></p>', attachments: [],
      rule: 'approved', stageId: null, updatedAt: ts(T0), updatedBy: 'adm1', updatedByName: 'Adele',
    })
  })

  it('gathers facts, fields, templates, the speaker and only this thread', async () => {
    await sentEmail('e1', 'th-1', T0, 'Welcome Ada', 'Hello Ada, you are in.')
    await thread('th-1')
    await message('th-1', 'm1', 'reply', T0 + 10 * MIN, 'Can I bring my laptop?')
    await message('th-1', 'm2', 'team', T0 + 15 * MIN, 'Yes you can.')
    await message('th-1', 'b1', 'bounce', T0 + 16 * MIN, 'Bounced')
    await message('th-1', 'm3', 'reply', T0 + 20 * MIN, 'And a charger?')
    // Another thread of the same speaker.
    await sentEmail('e2', 'th-2', T0, 'Other', 'Other thread email')
    await thread('th-2')
    await message('th-2', 'x1', 'reply', T0 + 12 * MIN, 'Other thread reply')

    const input = await buildDraftInput(db, 'th-1')
    expect(input.facts).toBe('Doors open at 9.')
    expect(input.eventFields).toEqual([{ label: 'Venue', value: 'Hall A' }])
    expect(input.templates).toEqual(expect.arrayContaining([
      { name: 'Acceptance', text: 'Plain body' },
      { name: 'Logistics', text: expect.stringContaining('Rich text') },
    ]))
    expect(input.speaker).toEqual({ firstName: 'Ada', talkTitles: ['Fake Engines'] })
    expect(input.conversation).toEqual([
      { from: 'team', at: T0, text: 'Hello Ada, you are in.' },
      { from: 'speaker', at: T0 + 10 * MIN, text: 'Can I bring my laptop?' },
      { from: 'team', at: T0 + 15 * MIN, text: 'Yes you can.' },
      { from: 'speaker', at: T0 + 20 * MIN, text: 'And a charger?' },
    ])
    expect(JSON.stringify(input)).not.toContain('Other thread')
  })
})

describe('replyErrorCode', () => {
  it('keeps only statuses and short codes, never message text', () => {
    expect(replyErrorCode(new Error('decisions failed: http 503 rate_limited'))).toBe('http 503')
    expect(replyErrorCode(new Error('invalid decision output'))).toBe('invalid output')
    expect(replyErrorCode(new Error('invalid draft output'))).toBe('invalid output')
    expect(replyErrorCode(Object.assign(new Error('Dear Ada, thanks'), { status: 429 }))).toBe('http 429')
    expect(replyErrorCode(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe('code ECONNRESET')
    expect(replyErrorCode(Object.assign(new Error('x'), { code: 'Speaker said: <b>hi</b>' }))).toBe('unknown')
    expect(replyErrorCode(new Error('Speaker wrote: can I bring my laptop'))).toBe('unknown')
    expect(replyErrorCode(Object.assign(new Error('x'), { code: 'Can I bring my laptop' }))).toBe('unknown')
  })
})
