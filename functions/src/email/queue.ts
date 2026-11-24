// The send queue: enqueue (one deterministic doc per batch and speaker), processQueue (scheduled → queued → sending →
// sent | failed | held | unknown), and the admin actions on a queued email. Gmail is only ever called for a doc this
// run moved from `queued` to `sending` in a transaction, and a doc stuck in `sending` becomes `unknown`, never resent.
// Server-only. Logs hold counts and ids only.
import { createHash } from 'node:crypto'
import { Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore'
import type { EmailDoc, EmailTemplate, RecipientRule, ThreadDoc } from '../model.js'
import { compose, inFlightConflict, QueueRefused, replySubject, sendTimeConflict } from './compose.js'
import { toHtml } from './fillIns.js'
import type { GmailClient } from './gmail.js'
import { loadSpeakers } from './loadSpeakers.js'
import { buildRaw, newMessageId } from './mime.js'
import { eligibility } from './recipients.js'

export { QueueRefused } from './compose.js'

export interface EnqueueInput {
  batchId: string; templateId: string | null; custom: { subject: string; body: string } | null; speakerKeys: string[];
  followUp: boolean; sendAt: number | null; includeCc: boolean; replyToThreadId: string | null
}
export interface Actor { uid: string; name: string }

const STALE_MS = 10 * 60 * 1000
const MAX_PER_RUN = 50
const PAUSE_MS = 1000
const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024
const UNKNOWN_REASON = 'May have been sent, check Gmail Sent'
const CUSTOM_NAME = 'Custom email'
const FROM_NAME = 'DevFest Istanbul'

export const emailId = (batchId: string, speakerKey: string) =>
  `${batchId}__${createHash('sha1').update(speakerKey).digest('hex').slice(0, 12)}`

const isDecisionRule = (r: RecipientRule) => r === 'acceptance' || r === 'decline'
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)
const isAlreadyExists = (e: unknown) => (e as { code?: unknown }).code === 6

async function templateOf(db: Firestore, id: string): Promise<EmailTemplate> {
  const snap = await db.doc(`templates/${id}`).get()
  if (!snap.exists) throw new QueueRefused('Template not found')
  return snap.data() as EmailTemplate
}

function checkInput(i: EnqueueInput): void {
  if (typeof i.batchId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(i.batchId)) throw new QueueRefused('Invalid batch id')
  if ((i.templateId === null) === (i.custom === null)) throw new QueueRefused('Pick a template or write a custom email')
  if (i.custom && (typeof i.custom.subject !== 'string' || typeof i.custom.body !== 'string' || i.custom.body.trim() === '')) {
    throw new QueueRefused('A custom email needs a body')
  }
  if (!Array.isArray(i.speakerKeys) || i.speakerKeys.length === 0) throw new QueueRefused('Pick at least one speaker')
  if (i.followUp && i.speakerKeys.length !== 1) throw new QueueRefused('A follow-up goes to one speaker at a time')
  if (i.replyToThreadId !== null && (i.templateId !== null || i.speakerKeys.length !== 1)) {
    throw new QueueRefused('A reply is a custom email to one speaker')
  }
  if (i.sendAt !== null && !Number.isFinite(i.sendAt)) throw new QueueRefused('Invalid send time')
}

/** Queues one email per speaker. A speaker who already has a doc in this batch is returned as queued, unchanged. */
export async function enqueue(
  db: Firestore, input: EnqueueInput, actor: Actor, now: number = Date.now(),
): Promise<{ queued: string[]; skipped: { speakerKey: string; reason: string }[] }> {
  checkInput(input)
  const template = input.templateId === null ? null : await templateOf(db, input.templateId)
  const source = template ?? input.custom!
  const rule: RecipientRule = template?.rule ?? 'anyone'
  const scheduled = input.sendAt !== null && input.sendAt > now
  const loaded = await loadSpeakers(db)
  const queued: string[] = []
  const skipped: { speakerKey: string; reason: string }[] = []

  for (const speakerKey of [...new Set(input.speakerKeys)]) {
    const id = emailId(input.batchId, speakerKey)
    const ref = db.doc(`emails/${id}`)
    if ((await ref.get()).exists) {
      queued.push(id)
      continue
    }
    if (input.custom && input.replyToThreadId === null && input.custom.subject.trim() === '') {
      skipped.push({ speakerKey, reason: 'A custom email needs a subject' })
      continue
    }
    const g = loaded.groups.find((x) => x.speakerKey === speakerKey)
    const conflict = inFlightConflict(loaded.historyOf(speakerKey), input.templateId, rule)
    if (conflict) {
      skipped.push({ speakerKey, reason: conflict })
      continue
    }
    const subjectOverride = input.replyToThreadId ? await replySubject(db, input.replyToThreadId, speakerKey) : undefined
    const c = compose(rule, source, g, loaded, {
      templateId: input.templateId, followUp: input.followUp, includeCc: input.includeCc, render: !scheduled, subjectOverride,
    })
    if (!c.ok) {
      skipped.push({ speakerKey, reason: c.reason })
      continue
    }
    const doc: EmailDoc = {
      batchId: input.batchId, speakerKey, to: g!.email.trim(), cc: c.cc, templateId: input.templateId,
      templateName: template?.name ?? CUSTOM_NAME, rule, isDecision: isDecisionRule(rule), talkIds: c.talkIds,
      subject: c.subject, text: c.text, attachments: template?.attachments ?? [],
      sendAt: Timestamp.fromMillis(scheduled ? input.sendAt! : now), state: scheduled ? 'scheduled' : 'queued', reason: null,
      manual: false, replyToThreadId: input.replyToThreadId, gmailMessageId: null, threadId: input.replyToThreadId,
      rfcMessageId: null, claimedAt: null, sentAt: null, bounce: null, replyCount: 0, lastReplyAt: null,
      by: actor.uid, byName: actor.name, createdAt: Timestamp.fromMillis(now),
      request: { followUp: input.followUp, includeCc: input.includeCc, custom: input.custom },
    }
    try {
      await ref.create(doc)
    } catch (e) {
      if (!isAlreadyExists(e)) throw e
    }
    queued.push(id)
  }
  console.log(`Email enqueue ${input.batchId}: queued=${queued.length} skipped=${skipped.length}`)
  return { queued, skipped }
}

export interface ProcessOpts {
  sender: string
  now: number
  readAttachment: (path: string) => Promise<Buffer>
  /** Pause between Gmail sends; injectable so tests don't wait. */
  sleep?: (ms: number) => Promise<void>
  /** Real time for claimedAt and sentAt (a run can take minutes); `now` decides what is due and what is stale. */
  clock?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** One run: stale `sending` → `unknown`; due `scheduled` → written and `queued` (or `held`); up to 50 `queued` sent. */
export async function processQueue(
  db: Firestore, gmail: GmailClient, opts: ProcessOpts,
): Promise<{ sent: number; failed: number; held: number; unknown: number }> {
  const counts = { sent: 0, failed: 0, held: 0, unknown: 0 }
  const emails = db.collection('emails')

  // 1. A claim older than 10 minutes means Gmail may or may not have the message: never resend it automatically.
  for (const d of (await emails.where('state', '==', 'sending').get()).docs) {
    const claimed = (d.get('claimedAt') as Timestamp | null)?.toMillis() ?? 0
    if (opts.now - claimed <= STALE_MS) continue
    const moved = await db.runTransaction(async (tx) => {
      const s = await tx.get(d.ref)
      if (s.get('state') !== 'sending' || ((s.get('claimedAt') as Timestamp | null)?.toMillis() ?? 0) !== claimed) return false
      tx.update(d.ref, { state: 'unknown', reason: UNKNOWN_REASON })
      return true
    })
    if (moved) counts.unknown++
  }

  // 2. Scheduled emails are written now, so event and template edits apply; one that no longer qualifies is held.
  const due = (await emails.where('state', '==', 'scheduled').get()).docs
    .filter((d) => (d.get('sendAt') as Timestamp).toMillis() <= opts.now)
  if (due.length) {
    const loaded = await loadSpeakers(db)
    for (const d of due) {
      const e = d.data() as EmailDoc
      let update: Partial<EmailDoc>
      try {
        update = await writeScheduled(db, e, loaded)
      } catch {
        // One bad email (e.g. odd data written outside the UI) must not stop the rest of the run.
        console.error(`Email queue: could not prepare ${d.id}`)
        update = { state: 'held', reason: 'Could not prepare this email' }
      }
      const moved = await db.runTransaction(async (tx) => {
        const s = await tx.get(d.ref)
        if (s.get('state') !== 'scheduled' || (s.get('sendAt') as Timestamp).toMillis() > opts.now) return false
        tx.update(d.ref, update)
        return true
      })
      if (moved && update.state === 'held') counts.held++
    }
  }

  // 3. Send queued emails, oldest send time first.
  const queued = (await emails.where('state', '==', 'queued').get()).docs
    .sort((a, b) => (a.get('sendAt') as Timestamp).toMillis() - (b.get('sendAt') as Timestamp).toMillis())
    .slice(0, MAX_PER_RUN)
  const sleep = opts.sleep ?? defaultSleep
  const clock = opts.clock ?? Date.now
  // Who an email may go to is judged again now: a status can change while an email waits, is retried or requeued.
  const current = queued.length ? await loadSpeakers(db) : null
  let calledGmail = false
  for (const d of queued) {
    // The claim re-checks, against everything already sent or being sent, that this email isn't a second decision
    // email or a repeat of a template: enqueue's checks are check-then-act, so two batches could both have queued one.
    const claim = await db.runTransaction(async (tx) => {
      const s = await tx.get(d.ref)
      if (s.get('state') !== 'queued') return null
      const doc = s.data() as EmailDoc
      const refusal = current && stillEligible(doc, current)
      if (refusal) {
        tx.update(d.ref, { state: 'held', reason: refusal })
        return 'held' as const
      }
      const others = (await tx.get(emails.where('speakerKey', '==', doc.speakerKey))).docs
        .filter((o) => o.id !== d.id).map((o) => o.data() as EmailDoc)
      const conflict = sendTimeConflict(doc, others)
      if (conflict) {
        tx.update(d.ref, { state: 'held', reason: conflict })
        return 'held' as const
      }
      tx.update(d.ref, { state: 'sending', claimedAt: Timestamp.fromMillis(clock()) })
      return doc
    })
    if (claim === 'held') counts.held++
    if (claim === null || claim === 'held') continue
    const e = claim
    if (calledGmail) await sleep(PAUSE_MS)
    calledGmail = true

    let prepared: Prepared
    let result: { id: string; threadId: string }
    try {
      prepared = await prepare(e, gmail, opts)
    } catch (err) {
      // Nothing reached Gmail: a visible failure the admin can retry by hand.
      await markFailed(db, d.ref, 'failed', errorText(err))
      counts.failed++
      continue
    }
    try {
      result = await gmail.send(prepared.raw, e.threadId ?? undefined)
    } catch (err) {
      // Gmail refused it (4xx) or we never reached it: failed. A 5xx, timeout or network error can come after Gmail
      // took the message, so it may have been sent: unknown, never resent automatically.
      if (gmailRefused(err)) {
        await markFailed(db, d.ref, 'failed', errorText(err))
        counts.failed++
      } else {
        await markFailed(db, d.ref, 'unknown', UNKNOWN_REASON)
        counts.unknown++
      }
      continue
    }
    try {
      await recordSent(db, d.ref, e, prepared, result, clock())
      counts.sent++
    } catch {
      // Sent but not recorded: the doc stays `sending` and becomes `unknown` on a later run.
      console.error(`Email queue: sent ${d.id} but could not record it`)
    }
    // The label only helps find dashboard mail in Gmail; a failure never changes a sent email.
    await gmail.label(result.id).catch((err: unknown) =>
      console.warn(`Email queue: could not label ${d.id}: ${err instanceof Error ? err.message : 'unknown error'}`))
  }

  if (counts.sent) await db.doc('meta/mail').set({ lastSendAt: Timestamp.fromMillis(opts.now) }, { merge: true })
  if (counts.sent || counts.failed || counts.held || counts.unknown) {
    console.log(`Email queue: sent=${counts.sent} failed=${counts.failed} held=${counts.held} unknown=${counts.unknown}`)
  }
  return counts
}

/** The update for a due scheduled email: written and `queued`, or `held` with the reason. */
async function writeScheduled(
  db: Firestore, e: EmailDoc, loaded: Awaited<ReturnType<typeof loadSpeakers>>,
): Promise<Partial<EmailDoc>> {
  const held = (reason: string): Partial<EmailDoc> => ({ state: 'held', reason })
  const req = e.request ?? { followUp: false, includeCc: true, custom: null }
  let source: { subject: string; body: string }
  let template: EmailTemplate | null = null
  if (e.templateId !== null) {
    const snap = await db.doc(`templates/${e.templateId}`).get()
    if (!snap.exists) return held('Template was deleted')
    template = snap.data() as EmailTemplate
    // Recipients were confirmed against the old rule; the admin has to look at it again.
    if (template.rule !== e.rule) return held("Template's recipients rule changed")
    source = template
  } else if (req.custom) {
    source = req.custom
  } else {
    return held('Email has no content')
  }
  let subjectOverride: string | undefined
  if (e.replyToThreadId) {
    try {
      subjectOverride = await replySubject(db, e.replyToThreadId, e.speakerKey)
    } catch (err) {
      if (err instanceof QueueRefused) return held(err.message)
      throw err
    }
  }
  const g = loaded.groups.find((x) => x.speakerKey === e.speakerKey)
  const c = compose(e.rule, source, g, loaded, {
    templateId: e.templateId, followUp: req.followUp, includeCc: req.includeCc, render: true, subjectOverride,
  })
  if (!c.ok) return held(c.reason)
  return {
    state: 'queued', reason: null, subject: c.subject, text: c.text, talkIds: c.talkIds, cc: c.cc, to: g!.email.trim(),
    ...(template ? { templateName: template.name, attachments: template.attachments } : {}),
  }
}

interface Prepared { raw: string; messageId: string }

/** Attachments are read only from `emailAttachments/<template id>/…`, admin-uploaded; no `..` or empty segments. */
const attachmentAllowed = (path: string) => {
  const parts = path.split('/')
  return parts.length >= 3 && parts[0] === 'emailAttachments' && parts.every((p) => p !== '' && p !== '.' && p !== '..')
}

type Sendable = Pick<EmailDoc, 'to' | 'cc' | 'subject' | 'text' | 'templateId' | 'attachments' | 'replyToThreadId'>

/** Reads the attachments and reply headers and builds the message. Throws on anything that must not be sent. */
async function prepare(e: Sendable, gmail: GmailClient, opts: Pick<ProcessOpts, 'sender' | 'readAttachment'>): Promise<Prepared> {
  if (e.subject === null || e.text === null) throw new Error('Email was not written')
  const attachments: { name: string; contentType: string; data: Buffer }[] = []
  let total = 0
  for (const a of e.attachments) {
    // Any template's folder: "Duplicate" copies the original template's attachment paths (Ruling 17).
    if (!attachmentAllowed(a.path)) throw new Error('Attachment not allowed')
    const data = await opts.readAttachment(a.path)
    total += data.length
    if (total > MAX_ATTACHMENTS_BYTES) throw new Error('Attachments are over 20 MB')
    attachments.push({ name: a.name, contentType: a.contentType, data })
  }
  let inReplyTo: string | undefined
  let references: string | undefined
  if (e.replyToThreadId) {
    const header = (m: { payload?: { headers?: { name?: string | null; value?: string | null }[] | null } | null }, n: string) =>
      m.payload?.headers?.find((h) => h.name?.toLowerCase() === n)?.value?.trim() ?? ''
    const last = (await gmail.getThread(e.replyToThreadId)).filter((m) => header(m, 'message-id') !== '').at(-1)
    if (last) {
      inReplyTo = header(last, 'message-id')
      references = [header(last, 'references'), inReplyTo].filter(Boolean).join(' ')
    }
  }
  const messageId = newMessageId(opts.sender.split('@').at(-1) ?? '')
  const raw = buildRaw({
    from: `${FROM_NAME} <${opts.sender}>`, to: e.to, cc: e.cc, subject: e.subject, text: e.text, html: toHtml(e.text),
    attachments, inReplyTo, references, messageId,
  })
  return { raw, messageId }
}

async function markFailed(db: Firestore, ref: DocumentReference, state: 'failed' | 'unknown', reason: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (s.get('state') === 'sending') tx.update(ref, { state, reason })
  })
}

/**
 * Whether a Gmail send error means the message was certainly not sent: an HTTP 4xx (gmail.ts puts the status in the
 * message, "Gmail send failed (400)") or an auth failure before the send call. Anything else may have been sent.
 */
export function gmailRefused(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.startsWith('Gmail auth')) return true
  const status = /\((\d{3})\)/.exec(msg)?.[1]
  return status !== undefined && status.startsWith('4')
}

/**
 * Null when the queued email may still go to its speaker as written; otherwise the reason to hold it. Custom emails
 * and replies (rule "anyone") always may. `loaded` comes from the start of the run; the claim's sendTimeConflict
 * covers emails sent during it.
 */
function stillEligible(e: EmailDoc, loaded: Awaited<ReturnType<typeof loadSpeakers>>): string | null {
  if (e.rule === 'anyone') return null
  const g = loaded.groups.find((x) => x.speakerKey === e.speakerKey)
  if (!g) return 'Speaker has no talks'
  // This email's own doc is in the history (batch id + speaker key is its id); it must not count against itself.
  const history = loaded.historyOf(e.speakerKey).filter((h) => h.batchId !== e.batchId)
  const r = eligibility(e.rule, g, loaded.status, history, {
    speakerKeys: new Set(loaded.groups.map((x) => x.speakerKey)), followUp: e.request?.followUp ?? false, templateId: e.templateId,
  })
  if (!r.ok) return r.reason
  if (!e.talkIds.every((id) => r.talkIds.includes(id))) return 'Talks changed since this email was written'
  return null
}

/** Records the send and upserts the thread (Ruling 2: lastTeamAt and lastSnippet). */
async function recordSent(
  db: Firestore, ref: DocumentReference, e: EmailDoc, p: Prepared, r: { id: string; threadId: string }, now: number,
): Promise<void> {
  const at = Timestamp.fromMillis(now)
  const threadRef = db.doc(`threads/${r.threadId}`)
  await db.runTransaction(async (tx) => {
    const t = (await tx.get(threadRef)).data() as ThreadDoc | undefined
    tx.update(ref, { state: 'sent', reason: null, gmailMessageId: r.id, threadId: r.threadId, rfcMessageId: p.messageId, sentAt: at })
    const lastTeam = t?.lastTeamAt && t.lastTeamAt.toMillis() > now ? t.lastTeamAt : at
    const thread: ThreadDoc = {
      speakerKey: t?.speakerKey ?? e.speakerKey, firstSentAt: t?.firstSentAt ?? at, lastCheckedAt: t?.lastCheckedAt ?? null,
      seenIds: [...new Set([...(t?.seenIds ?? []), r.id])], lastReplyAt: t?.lastReplyAt ?? null, lastTeamAt: lastTeam,
      lastSnippet: [...(e.text ?? '')].slice(0, 140).join(''),
    }
    tx.set(threadRef, thread, { merge: true })
  })
}

/**
 * Records speakers emailed outside the dashboard as manual `sent` entries, so later batches skip them. Talks come from
 * current eligibility without the prior-email checks. Returns how many entries were created.
 */
export async function markEmailed(
  db: Firestore, input: { templateId: string; speakerKeys: string[]; at: number }, actor: Actor,
): Promise<number> {
  if (!Number.isFinite(input.at)) throw new QueueRefused('Invalid time')
  const template = await templateOf(db, input.templateId)
  const loaded = await loadSpeakers(db)
  const speakerKeys = new Set(loaded.groups.map((g) => g.speakerKey))
  const batchId = `manual_${input.templateId}_${input.at}`
  const at = Timestamp.fromMillis(input.at)
  let created = 0
  for (const speakerKey of [...new Set(input.speakerKeys)]) {
    const g = loaded.groups.find((x) => x.speakerKey === speakerKey)
    if (!g) continue
    if (inFlightConflict(loaded.historyOf(speakerKey), input.templateId, template.rule)) continue
    const e = eligibility(template.rule, g, loaded.status, [], { speakerKeys, templateId: input.templateId })
    if (!e.ok) continue
    const doc: EmailDoc = {
      batchId, speakerKey, to: g.email.trim(), cc: [], templateId: input.templateId, templateName: template.name,
      rule: template.rule, isDecision: isDecisionRule(template.rule), talkIds: e.talkIds, subject: null, text: null,
      attachments: [], sendAt: at, state: 'sent', reason: null, manual: true, replyToThreadId: null, gmailMessageId: null,
      threadId: null, rfcMessageId: null, claimedAt: null, sentAt: at, bounce: null, replyCount: 0, lastReplyAt: null,
      by: actor.uid, byName: actor.name, createdAt: Timestamp.now(),
    }
    try {
      await db.doc(`emails/${emailId(batchId, speakerKey)}`).create(doc)
      created++
    } catch (err) {
      if (!isAlreadyExists(err)) throw err
    }
  }
  console.log(`Email mark emailed ${input.templateId}: created=${created}`)
  return created
}

/** Moves one email from an allowed state inside a transaction; refuses with `refusal` otherwise. */
async function transition(
  db: Firestore, id: string, from: EmailDoc['state'][], refusal: string, update: (e: EmailDoc) => Partial<EmailDoc>,
): Promise<void> {
  const ref = db.doc(`emails/${id}`)
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) throw new QueueRefused('Email not found')
    const e = s.data() as EmailDoc
    if (!from.includes(e.state)) throw new QueueRefused(refusal)
    tx.update(ref, update(e))
  })
}

export const cancelEmail = (db: Firestore, id: string, actor: Actor) =>
  transition(db, id, ['scheduled', 'queued', 'held'], 'Emails can be cancelled only before sending',
    () => ({ state: 'cancelled', reason: `Cancelled by ${actor.name}` }))

/**
 * By hand, after a look: `failed` → `queued` as it was written (Gmail refused it, nothing was sent); `held` → `scheduled`
 * due now, so the next run writes it again and re-checks who it may go to.
 */
export const retryEmail = (db: Firestore, id: string, _actor: Actor, now: number = Date.now()) =>
  transition(db, id, ['failed', 'held'], 'Only a failed or held email can be retried', (e) =>
    e.state === 'failed'
      ? { state: 'queued', reason: null, claimedAt: null }
      : { state: 'scheduled', reason: null, claimedAt: null, sendAt: Timestamp.fromMillis(now) })

export async function rescheduleEmail(db: Firestore, id: string, sendAt: number, _actor: Actor): Promise<void> {
  if (!Number.isFinite(sendAt)) throw new QueueRefused('Invalid send time')
  await transition(db, id, ['scheduled'], 'Only a scheduled email can be re-timed', () => ({ sendAt: Timestamp.fromMillis(sendAt) }))
}

/** `unknown` → `sent` (the admin found it in Gmail Sent) or back to `queued` (the only way an email is sent again). */
export async function resolveUnknown(db: Firestore, id: string, to: 'sent' | 'requeue', actor: Actor): Promise<void> {
  if (to !== 'sent' && to !== 'requeue') throw new QueueRefused('Resolve as sent or requeue')
  await transition(db, id, ['unknown'], 'Only an email that may have been sent can be resolved', (e) =>
    to === 'sent'
      ? { state: 'sent', reason: `Marked as sent by ${actor.name}`, sentAt: e.claimedAt ?? Timestamp.now() }
      : { state: 'queued', reason: null, claimedAt: null })
}

export interface TestEmailInput {
  templateId: string | null; custom: { subject: string; body: string } | null; speakerKey: string; followUp?: boolean
}

/**
 * "Send test to me": the speaker's email as it would be written now, sent only to `to` (the admin) with "[TEST] " in
 * front of the subject, never CC'd and not recorded anywhere. Refuses when the speaker couldn't get it.
 */
export async function sendTestEmail(
  db: Firestore, gmail: GmailClient, input: TestEmailInput, to: string, opts: Pick<ProcessOpts, 'sender' | 'readAttachment'>,
): Promise<void> {
  if ((input.templateId === null) === (input.custom === null)) throw new QueueRefused('Pick a template or write a custom email')
  const template = input.templateId === null ? null : await templateOf(db, input.templateId)
  const source = template ?? input.custom!
  if (source.subject.trim() === '') throw new QueueRefused('A custom email needs a subject')
  const loaded = await loadSpeakers(db)
  const g = loaded.groups.find((x) => x.speakerKey === input.speakerKey)
  const c = compose(template?.rule ?? 'anyone', source, g, loaded, {
    templateId: input.templateId, followUp: input.followUp ?? false, includeCc: false, render: true,
  })
  if (!c.ok) throw new QueueRefused(c.reason)
  const p = await prepare({
    to, cc: [], subject: `[TEST] ${c.subject}`, text: c.text, templateId: input.templateId,
    attachments: template?.attachments ?? [], replyToThreadId: null,
  }, gmail, opts)
  await gmail.send(p.raw)
  console.log(`Email test sent for template ${input.templateId ?? 'custom'}`)
}
