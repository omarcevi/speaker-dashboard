// Writing one queued email: who it may go to (eligibility) and what it says (rendered fill-ins). Used by the queue
// when an email is enqueued for "Send now" and again when a scheduled email comes due. Server-only.
import type { Firestore } from 'firebase-admin/firestore'
import type { EmailDoc, RecipientRule } from '../model.js'
import { renderEmail } from './fillIns.js'
import type { LoadedSpeakers } from './loadSpeakers.js'
import { eligibility, fillInValues, type SpeakerGroup } from './recipients.js'

/** A request the queue refuses as a whole (bad input, unknown template or thread); callers map it to invalid-argument. */
export class QueueRefused extends Error {}

export type Composed =
  | { ok: true; talkIds: string[]; cc: string[]; subject: string | null; text: string | null }
  | { ok: false; reason: string }

const list = (names: string[]) => names.join(', ')

/** Why a render failed, in words for the admin: "Empty fill-in: venue". */
export function renderProblem(missing: string[], empty: string[]): string {
  const parts: string[] = []
  if (missing.length) parts.push(`Unknown fill-in${missing.length > 1 ? 's' : ''}: ${list(missing)}`)
  if (empty.length) parts.push(`Empty fill-in${empty.length > 1 ? 's' : ''}: ${list(empty)}`)
  return parts.join('; ')
}

/**
 * Checks `g` against the rule and, when `render` is set, writes the email. `source` is the template's (or custom
 * email's) subject and body; `subjectOverride` replaces the rendered subject (replies use "Re: <first subject>").
 */
export function compose(
  rule: RecipientRule, source: { subject: string; body: string }, g: SpeakerGroup | undefined, loaded: LoadedSpeakers,
  opts: { templateId: string | null; followUp: boolean; includeCc: boolean; render: boolean; subjectOverride?: string },
): Composed {
  if (!g) return { ok: false, reason: 'Speaker has no talks' }
  const speakerKeys = new Set(loaded.groups.map((x) => x.speakerKey))
  const e = eligibility(rule, g, loaded.status, loaded.historyOf(g.speakerKey), {
    speakerKeys, followUp: opts.followUp, templateId: opts.templateId,
  })
  if (!e.ok) return e
  const cc = opts.includeCc ? e.cc : []
  if (!opts.render) return { ok: true, talkIds: e.talkIds, cc, subject: null, text: null }
  const values = fillInValues(g, e.talkIds, loaded.event)
  // An override is already final text: it is not filled in again.
  const r = renderEmail({ subject: opts.subjectOverride === undefined ? source.subject : '', body: source.body }, values)
  if (!r.ok) return { ok: false, reason: renderProblem(r.missing, r.empty) }
  return { ok: true, talkIds: e.talkIds, cc, subject: opts.subjectOverride ?? r.subject, text: r.text }
}

export { inFlightConflict } from './recipients.js'

/** States in which Gmail has, or may have, the message. */
const CLAIMED = new Set(['sent', 'sending', 'unknown'])

/**
 * Checked again inside the send claim, against the speaker's other emails: a second decision email, or a second copy
 * of the same template, is held rather than sent. An explicit follow-up is exempt (it is the confirmed resend).
 */
export function sendTimeConflict(e: EmailDoc, others: EmailDoc[]): string | null {
  if (e.request?.followUp) return null
  const claimed = others.filter((o) => CLAIMED.has(o.state))
  if (e.isDecision && claimed.some((o) => o.isDecision)) return 'Already had a decision email'
  if (e.templateId !== null && claimed.some((o) => o.templateId === e.templateId)) return 'Already sent this template'
  return null
}

/**
 * "Re: <subject of our first email in the thread>". Refuses a thread that isn't this speaker's, so a reply can't
 * land in someone else's conversation.
 */
export async function replySubject(db: Firestore, threadId: string, speakerKey: string): Promise<string> {
  const thread = await db.doc(`threads/${threadId}`).get()
  if (!thread.exists || thread.get('speakerKey') !== speakerKey) throw new QueueRefused('Thread not found for this speaker')
  const sent = (await db.collection('emails').where('threadId', '==', threadId).get()).docs
    .map((d) => d.data() as EmailDoc)
    .filter((e) => e.state === 'sent' && e.subject)
    .sort((a, b) => (a.sentAt?.toMillis() ?? 0) - (b.sentAt?.toMillis() ?? 0))
  if (!sent[0]) throw new QueueRefused('Thread has no sent email')
  return `Re: ${sent[0].subject!.replace(/^(\s*re:\s*)+/i, '').trim()}`
}
