// Reads the Gmail threads the dashboard started: new replies, bounces and team messages (sent from Gmail by a teammate)
// are stored under threads/{threadId}/messages/{gmailId}, and the email and thread docs are updated in the same
// transaction as the thread's seenIds, so a crash or a second run never counts a message twice. Also serves reply
// attachments to members, only for ids stored under that thread. Server-only. Logs hold counts and ids only.
import { Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore'
import type { EmailDoc, MailMeta, ReceivedMessage, ThreadDoc, Ts } from '../model.js'
import type { GmailClient } from './gmail.js'
import { parseMessage, type ParsedMessage } from './parseMessage.js'

const WINDOW_MS = 90 * 24 * 60 * 60 * 1000
const SNIPPET_LENGTH = 140
const ID = /^[A-Za-z0-9_-]{1,200}$/
// Ruling 10: a stored message must fit Firestore's 1 MiB document limit, or the thread's transaction fails every poll.
const CAP = { text: 200_000, quoted: 100_000, subject: 1_000, addresses: 100, attachments: 50 }
// Backstop for non-ASCII bodies, where the code-point caps alone can still exceed 1 MiB (up to 4 bytes each).
const MAX_BODY_BYTES = 800_000
const MAX_NEW_PER_POLL = 8

export interface PollOpts { sender: string; now: number }

const snippet = (text: string) => [...text].slice(0, SNIPPET_LENGTH).join('')
const maxTs = (a: Ts | null, ms: number): Ts => (a && a.toMillis() >= ms ? a : Timestamp.fromMillis(ms))

/** Caps a parsed message to the stored limits; `truncated: true` when anything was cut. */
export function capMessage(m: Omit<ReceivedMessage, 'at' | 'truncated'>): Omit<ReceivedMessage, 'at'> {
  const cut = (v: string, n: number) => {
    const cps = [...v]
    return cps.length > n ? cps.slice(0, n).join('') : v
  }
  let text = cut(m.text, CAP.text)
  let quoted = cut(m.quoted, CAP.quoted)
  const bytes = () => Buffer.byteLength(text) + Buffer.byteLength(quoted)
  if (bytes() > MAX_BODY_BYTES) quoted = ''
  while (bytes() > MAX_BODY_BYTES) text = [...text].slice(0, Math.floor([...text].length * 0.9)).join('')
  const out = {
    ...m, text, quoted, subject: cut(m.subject, CAP.subject), to: m.to.slice(0, CAP.addresses), cc: m.cc.slice(0, CAP.addresses),
    attachments: m.attachments.slice(0, CAP.attachments),
  }
  const truncated = out.text !== m.text || out.quoted !== m.quoted || out.subject !== m.subject || out.to.length !== m.to.length ||
    out.cc.length !== m.cc.length || out.attachments.length !== m.attachments.length
  return truncated ? { ...out, truncated: true } : out
}

/** A non-personal code for logs: the Gmail HTTP status from our error text, or a Firestore/gRPC error code. */
function errorCode(e: unknown): string {
  const http = /\((\d{3})\)/.exec(e instanceof Error ? e.message : '')?.[1]
  if (http) return `http ${http}`
  const code = (e as { code?: unknown } | null)?.code
  return typeof code === 'number' || (typeof code === 'string' && /^[\w-]{1,40}$/.test(code)) ? `code ${code}` : 'unknown'
}

/** Polls every thread the dashboard sent into in the last 90 days. A thread that fails is counted and skipped. */
export async function pollMail(
  db: Firestore, gmail: GmailClient, opts: PollOpts,
): Promise<{ threads: number; replies: number; bounces: number }> {
  const recent = await db.collection('threads').where('lastTeamAt', '>=', Timestamp.fromMillis(opts.now - WINDOW_MS)).get()
  let replies = 0
  let bounces = 0
  let failed = 0
  for (const d of recent.docs) {
    try {
      const r = await pollThread(db, gmail, d.ref, opts)
      replies += r.replies
      bounces += r.bounces
    } catch (e) {
      failed++
      console.error(`Mail poll: thread ${d.id} could not be read (${errorCode(e)})`)
    }
  }
  const meta: Partial<MailMeta> = {
    lastPollAt: Timestamp.fromMillis(opts.now), error: failed ? `${failed} ${failed === 1 ? 'thread' : 'threads'} could not be read` : null,
  }
  await db.doc('meta/mail').set(meta, { merge: true })
  if (replies || bounces || failed) console.log(`Mail poll: threads=${recent.size} replies=${replies} bounces=${bounces} failed=${failed}`)
  return { threads: recent.size, replies, bounces }
}

/** The thread's latest sent email at or before `atMs`; the latest sent one if none is that early. */
function emailFor(sent: { ref: DocumentReference; e: EmailDoc }[], atMs: number) {
  const sentMs = (x: { e: EmailDoc }) => x.e.sentAt?.toMillis() ?? 0
  const byTime = [...sent].sort((a, b) => sentMs(a) - sentMs(b))
  return byTime.filter((x) => sentMs(x) <= atMs).at(-1) ?? byTime.at(-1)
}

async function pollThread(
  db: Firestore, gmail: GmailClient, threadRef: DocumentReference, opts: PollOpts,
): Promise<{ replies: number; bounces: number }> {
  const fetched = await gmail.getThread(threadRef.id)
  const emailsQuery = db.collection('emails').where('threadId', '==', threadRef.id)

  return db.runTransaction(async (tx) => {
    const t = (await tx.get(threadRef)).data() as ThreadDoc | undefined
    if (!t) return { replies: 0, bounces: 0 }
    const emails = (await tx.get(emailsQuery)).docs.map((d) => ({ ref: d.ref, e: d.data() as EmailDoc }))
    // A dashboard email in flight may already be in Gmail without its id recorded, and a bounce or reply to it would be
    // credited to the previous email: defer the whole thread until it lands (`unknown` does not defer).
    if (emails.some((x) => x.e.state === 'sending')) {
      tx.update(threadRef, { lastCheckedAt: Timestamp.fromMillis(opts.now) })
      return { replies: 0, bounces: 0 }
    }
    const ours = new Set([...t.seenIds, ...emails.flatMap((x) => (x.e.gmailMessageId ? [x.e.gmailMessageId] : []))])

    const seen = new Set(t.seenIds)
    const stored: ParsedMessage[] = []
    const fresh: typeof fetched = []
    for (const m of fetched) {
      if (!m.id || !ID.test(m.id)) continue
      if (ours.has(m.id)) seen.add(m.id)
      else fresh.push(m)
    }
    // Ruling 12: at most 8 new messages per thread per poll, oldest first, so one commit stays under Firestore's 10 MiB
    // limit; the rest stay out of seenIds and are read next poll.
    const internalMs = (m: (typeof fetched)[number]) => Number(m.internalDate) || 0
    for (const m of fresh.sort((a, b) => internalMs(a) - internalMs(b)).slice(0, MAX_NEW_PER_POLL)) {
      const id = m.id!
      const p = parseMessage(m, opts.sender)
      const { atMs, rfcMessageId: _rfc, bounceReason: _reason, ...rest } = p
      const doc: ReceivedMessage = { ...capMessage(rest), at: Timestamp.fromMillis(atMs) }
      tx.set(threadRef.collection('messages').doc(id), doc)
      seen.add(id)
      stored.push({ ...p, text: doc.text })
    }

    const sent = emails.filter((x) => x.e.state === 'sent')
    const updates = new Map<DocumentReference, Partial<EmailDoc>>()
    const current = (x: { ref: DocumentReference; e: EmailDoc }) => ({ ...x.e, ...updates.get(x.ref) })
    let lastReplyAt = t.lastReplyAt
    let lastTeamAt = t.lastTeamAt
    let replies = 0
    let bounces = 0
    for (const p of stored) {
      if (p.kind === 'team') {
        lastTeamAt = maxTs(lastTeamAt, p.atMs)
        continue
      }
      const target = emailFor(sent, p.atMs)
      if (p.kind === 'reply') {
        replies++
        lastReplyAt = maxTs(lastReplyAt, p.atMs)
        if (target) {
          const e = current(target)
          updates.set(target.ref, { ...updates.get(target.ref), replyCount: e.replyCount + 1, lastReplyAt: maxTs(e.lastReplyAt, p.atMs) })
        }
      } else {
        bounces++
        if (target) updates.set(target.ref, { ...updates.get(target.ref), bounce: { reason: p.bounceReason ?? '', at: Timestamp.fromMillis(p.atMs) } })
      }
    }
    for (const [ref, u] of updates) tx.update(ref, u)

    // The snippet follows the newest message, so an older message found late doesn't replace a newer one.
    const newest = stored.reduce<ParsedMessage | null>((a, p) => (a && a.atMs >= p.atMs ? a : p), null)
    const latestKnown = Math.max(t.lastReplyAt?.toMillis() ?? 0, t.lastTeamAt?.toMillis() ?? 0)
    const thread: Partial<ThreadDoc> = {
      seenIds: [...seen], lastCheckedAt: Timestamp.fromMillis(opts.now), lastReplyAt, lastTeamAt,
      ...(newest && newest.atMs >= latestKnown ? { lastSnippet: snippet(newest.text) } : {}),
    }
    tx.update(threadRef, thread)
    return { replies, bounces }
  })
}

/** A reply attachment, only if that message is stored under that thread and lists that attachment. */
export async function attachmentFor(
  db: Firestore, gmail: GmailClient, threadId: string, messageId: string, attachmentId: string,
): Promise<{ name: string; mimeType: string; data: Buffer }> {
  const notFound = () => new Error('Attachment not found')
  if (![threadId, messageId].every((x) => typeof x === 'string' && ID.test(x)) || typeof attachmentId !== 'string') throw notFound()
  const snap = await db.doc(`threads/${threadId}/messages/${messageId}`).get()
  const a = (snap.data() as ReceivedMessage | undefined)?.attachments?.find((x) => x.id === attachmentId)
  if (!a) throw notFound()
  const data = await gmail.getAttachment(messageId, attachmentId)
  return { name: a.name, mimeType: a.mimeType, data }
}
