// AI reply assistant: reads each new speaker reply (decision), clears plain thank-yous, and drafts an answer for replies
// that need one. Results are written to threads/{id} only while the reply is still the thread's newest. Server-only.
// Logs ids, results and short error codes only: never reply text, prompts, model output or error messages.
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { EmailDoc, EmailTemplate, EventSettings, ReceivedMessage, ReplyReading, ThreadDoc } from '../model.js'
import type { DecisionInput, DraftInput, ReplyAi } from '../ai/replyAi.js'
import { autoClears, currentFor, topLabel, wantsDraft } from '../shared/replyAi.js'
import { emailHtmlToText } from './htmlText.js'
import { loadSpeakers } from './loadSpeakers.js'

export type AssistResult = 'stale' | 'cleared' | 'drafted' | 'flagged' | 'failed'

export class ReplyNotFound extends Error {
  constructor() { super('This thread has no reply to draft for.') }
}

/**
 * A non-personal code: an http status, or a short code token from the error. SDK and fetch errors can carry response
 * text in their message, so only these shapes are kept.
 */
export function replyErrorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : ''
  const http = /\bhttp (\d{3})\b/.exec(msg)?.[1] ?? /\((\d{3})\)/.exec(msg)?.[1]
  if (http) return `http ${http}`
  // replyAi.ts's own fixed messages for output it could not use.
  if (/^invalid (decision|draft) output$/.test(msg)) return 'invalid output'
  const status = (e as { status?: unknown } | null)?.status
  if (typeof status === 'number' && status >= 100 && status < 600) return `http ${status}`
  const code = (e as { code?: unknown } | null)?.code
  if (typeof code === 'number' || (typeof code === 'string' && /^[\w -]{1,60}$/.test(code))) return `code ${code}`
  if (e instanceof Error && e.name === 'TimeoutError') return 'timeout'
  return 'unknown'
}

interface Entry { from: 'team' | 'speaker'; at: number; subject: string; text: string }

/** This thread's messages (bounces left out) and its sent emails, oldest first. Never reads another thread. */
async function history(db: Firestore, threadId: string): Promise<Entry[]> {
  const [msgs, emails] = await Promise.all([
    db.collection(`threads/${threadId}/messages`).get(),
    db.collection('emails').where('threadId', '==', threadId).get(),
  ])
  const out: Entry[] = []
  for (const d of msgs.docs) {
    const m = d.data() as ReceivedMessage
    if (m.kind === 'bounce') continue
    out.push({ from: m.kind === 'reply' ? 'speaker' : 'team', at: m.at.toMillis(), subject: m.subject ?? '', text: m.text ?? '' })
  }
  for (const d of emails.docs) {
    const e = d.data() as EmailDoc
    if (e.state !== 'sent' || !e.sentAt) continue
    out.push({ from: 'team', at: e.sentAt.toMillis(), subject: e.subject ?? '', text: e.text ?? '' })
  }
  return out.sort((a, b) => a.at - b.at)
}

function decisionInput(reply: ReceivedMessage, past: Entry[]): DecisionInput {
  const at = reply.at.toMillis()
  const team = past.filter((x) => x.from === 'team' && x.at < at).at(-1)
  return {
    reply: reply.text ?? '', quoted: reply.quoted ?? '',
    previousTeam: team ? { subject: team.subject, text: team.text } : null,
  }
}

export async function buildDraftInput(db: Firestore, threadId: string): Promise<DraftInput> {
  const thread = (await db.doc(`threads/${threadId}`).get()).data() as ThreadDoc | undefined
  if (!thread) throw new ReplyNotFound()
  const [past, event, templates, loaded] = await Promise.all([
    history(db, threadId),
    db.doc('meta/event').get(),
    db.collection('templates').get(),
    loadSpeakers(db),
  ])
  const g = loaded.groups.find((x) => x.speakerKey === thread.speakerKey)
  return {
    facts: (event.data() as EventSettings | undefined)?.speakerFacts ?? '',
    eventFields: loaded.event.filter((f) => f.value.trim() !== '').map((f) => ({ label: f.label, value: f.value })),
    templates: templates.docs.map((d) => {
      const t = d.data() as EmailTemplate
      return { name: t.name, text: t.html ? emailHtmlToText(t.html) : t.body }
    }),
    speaker: {
      firstName: g?.name.first ?? '',
      talkTitles: g ? g.cards.filter((c) => loaded.status(c.id) === 'approved').map((c) => c.title) : [],
    },
    conversation: past.map(({ from, at, text }) => ({ from, at, text })),
  }
}

/**
 * Writes `fields` to the thread in a transaction, only while `messageId` is still its newest reply. `settledAt` adds
 * an AI `settled` unless the reply is already settled (an admin's mark is never replaced).
 */
async function writeIfCurrent(
  db: Firestore, threadId: string, messageId: string, fields: Partial<ThreadDoc>, settle: Timestamp | null,
  check: (t: ThreadDoc) => boolean = () => true,
): Promise<boolean> {
  const ref = db.doc(`threads/${threadId}`)
  return db.runTransaction(async (tx) => {
    const t = (await tx.get(ref)).data() as ThreadDoc | undefined
    if (!t || t.lastReplyId !== messageId || !check(t)) return false
    const update: Partial<ThreadDoc> = { ...fields }
    if (settle && !currentFor(t, t.settled)) update.settled = { messageId, by: 'ai', byName: 'AI', at: settle }
    tx.update(ref, update)
    return true
  })
}

/** Assesses one new reply. Never throws for model failures: they are recorded on `ai.error` as a code. */
export async function assistReply(
  db: Firestore, ai: ReplyAi, p: { threadId: string; messageId: string; now: number },
): Promise<AssistResult> {
  const result = await assess(db, ai, p)
  console.log(`Reply assist: ${result} thread=${p.threadId}`)
  return result
}

async function assess(db: Firestore, ai: ReplyAi, p: { threadId: string; messageId: string; now: number }): Promise<AssistResult> {
  const { threadId, messageId } = p
  const at = Timestamp.fromMillis(p.now)
  // Not yet read: a duplicate event for an already-assessed reply would otherwise undo an admin's Undo.
  const unread = (t: ThreadDoc) => t.ai?.messageId !== messageId
  const [threadSnap, msgSnap] = await Promise.all([
    db.doc(`threads/${threadId}`).get(),
    db.doc(`threads/${threadId}/messages/${messageId}`).get(),
  ])
  const thread = threadSnap.data() as ThreadDoc | undefined
  const reply = msgSnap.data() as ReceivedMessage | undefined
  if (!thread || thread.lastReplyId !== messageId || !unread(thread) || reply?.kind !== 'reply') return 'stale'

  const past = await history(db, threadId)
  let decision
  try {
    decision = await ai.decide(decisionInput(reply, past))
  } catch (e) {
    const error = replyErrorCode(e)
    console.error(`Reply assist: decision failed thread=${threadId} (${error})`)
    const failed: ReplyReading = { messageId, label: null, probabilities: null, confidence: null, model: '', at, error }
    return (await writeIfCurrent(db, threadId, messageId, { ai: failed }, null, unread)) ? 'failed' : 'stale'
  }

  const { probabilities, confidence, model } = decision
  const reading: ReplyReading = { messageId, label: topLabel(probabilities), probabilities, confidence, model, at, error: null }
  if (autoClears(probabilities)) {
    return (await writeIfCurrent(db, threadId, messageId, { ai: reading }, at, unread)) ? 'cleared' : 'stale'
  }
  if (!wantsDraft(probabilities)) {
    return (await writeIfCurrent(db, threadId, messageId, { ai: reading }, null, unread)) ? 'flagged' : 'stale'
  }
  let draft
  try {
    draft = await ai.draft(await buildDraftInput(db, threadId))
  } catch (e) {
    console.error(`Reply assist: draft failed thread=${threadId} (${replyErrorCode(e)})`)
    return (await writeIfCurrent(db, threadId, messageId, { ai: reading }, null, unread)) ? 'flagged' : 'stale'
  }
  const fields: Partial<ThreadDoc> = { ai: reading, draft: { messageId, text: draft.text, model: draft.model, at } }
  return (await writeIfCurrent(db, threadId, messageId, fields, null, unread)) ? 'drafted' : 'stale'
}

/**
 * Drafts an answer for the thread's newest reply, whatever its reading (the "Draft a reply" and "Redraft" buttons).
 * `drafting` is set while it runs. A draft for a reply that is no longer the newest is discarded.
 */
export async function draftReply(db: Firestore, ai: ReplyAi, p: { threadId: string; now: number }): Promise<{ ok: true }> {
  const ref = db.doc(`threads/${p.threadId}`)
  const thread = (await ref.get()).data() as ThreadDoc | undefined
  const messageId = thread?.lastReplyId
  if (!messageId) throw new ReplyNotFound()
  await ref.update({ drafting: Timestamp.fromMillis(p.now) })
  try {
    const draft = await ai.draft(await buildDraftInput(db, p.threadId))
    const at = Timestamp.fromMillis(p.now)
    const wrote = await writeIfCurrent(db, p.threadId, messageId, {
      draft: { messageId, text: draft.text, model: draft.model, at }, drafting: null,
    }, null)
    if (!wrote) await ref.update({ drafting: null })
    console.log(`Reply draft: ${wrote ? 'drafted' : 'stale'} thread=${p.threadId}`)
  } catch (e) {
    await ref.update({ drafting: null })
    throw e
  }
  return { ok: true }
}
