import type { ReplyDraft, ThreadDoc } from '../../../functions/src/model.ts'
import { currentFor } from '../../../functions/src/shared/replyAi.ts'

// Decisions behind the AI reply assistant's controls in the conversation sheet.

/** A fill-in the draft left for a person, like [venue address?]. */
const GAP = /\[[^\]\n]{1,80}\]/

export const firstGap = (text: string): string | null => GAP.exec(text)?.[0] ?? null

export type SendStep = { kind: 'empty' } | { kind: 'confirm'; gap: string } | { kind: 'send' }

/** What pressing Send does: nothing for an empty box, ask first when gaps are left (unless confirmed), else send. */
export function sendStep(body: string, confirmed: boolean): SendStep {
  if (body.trim() === '') return { kind: 'empty' }
  const gap = confirmed ? null : firstGap(body)
  return gap ? { kind: 'confirm', gap } : { kind: 'send' }
}

/** The speaker's newest reply came after the team's last message (settled or not). */
const awaitingTeam = (thread: ThreadDoc | undefined): boolean =>
  (thread?.lastReplyAt?.toMillis() ?? 0) > (thread?.lastTeamAt?.toMillis() ?? 0)

/** The draft worth showing: one for the newest reply, while the team hasn't answered it yet. */
export const currentDraft = (thread: ThreadDoc | undefined): ReplyDraft | null =>
  awaitingTeam(thread) ? currentFor(thread, thread?.draft) : null

/** Draft a reply / Redraft is offered while the newest reply is unanswered. */
export const canDraft = (thread: ThreadDoc | undefined): boolean => !!thread?.lastReplyId && awaitingTeam(thread)

export type Seen = { key: string; text: string }
export const seenOf = (d: ReplyDraft): Seen => ({ key: `${d.messageId}:${d.at.toMillis()}`, text: d.text })

/** The reply box after a draft arrives: a new draft fills the box only when it is empty or still holds the last
 *  draft, so typed text is never replaced, unless the admin asked for this draft (Draft a reply / Redraft), in which
 *  case it replaces the box. Null when this draft was already seen. */
export function prefill(body: string, seen: Seen | null, draft: ReplyDraft | null, asked = false): { body: string; seen: Seen } | null {
  if (!draft) return null
  const next = seenOf(draft)
  if (seen?.key === next.key) return null
  const untouched = asked || body.trim() === '' || (seen !== null && body === seen.text)
  return { body: untouched ? draft.text : body, seen: next }
}

/** A `drafting` mark older than this is left over from a run that never cleared it. */
export const DRAFTING_STALE_MS = 5 * 60_000

/** The server is drafting for this thread now; a mark older than 5 minutes no longer counts. */
export const isDrafting = (thread: ThreadDoc | undefined, now: number): boolean => {
  const at = thread?.drafting?.toMillis()
  return at !== undefined && now - at < DRAFTING_STALE_MS
}

/** A Draft a reply / Redraft request (made for reply `askedFor`) still stands only while that reply is the newest. */
export const askedNow = (askedFor: string | null, thread: ThreadDoc | undefined): boolean =>
  askedFor !== null && askedFor === thread?.lastReplyId
