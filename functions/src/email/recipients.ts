// Shared with the web app (Vite bundles it, so the send flow judges recipients like the server). May import only
// ../model.js, ../talkKey.js, ../shared/* and ./fillIns.js.
import type { EmailDoc, EventField, RecipientRule, Status } from '../model.js'
import type { Card } from '../shared/cards.js'
import { compareSubmitted } from '../shared/time.js'

// One speaker and the talks that count for email: removed and no-session cards are left out.
export interface SpeakerGroup { speakerKey: string; name: { first: string; last: string }; email: string; cards: Card[] }

// Groups cards by speaker, keeping card order; name and email come from the most recently submitted card.
export function speakerGroups(cards: Card[]): SpeakerGroup[] {
  const byKey = new Map<string, Card[]>()
  for (const c of cards) {
    if (c.removedFromSheet || c.noSession) continue
    const list = byKey.get(c.speakerKey)
    if (list) list.push(c)
    else byKey.set(c.speakerKey, [c])
  }
  return [...byKey].map(([speakerKey, list]) => {
    const latest = [...list].sort(compareSubmitted).at(-1)!
    return { speakerKey, name: { first: latest.firstName, last: latest.lastName }, email: latest.email, cards: list }
  })
}

// Any talk approved → approved; every talk declined → declined; otherwise (some pending or maybe) not ready.
export function decision(g: SpeakerGroup, status: (id: string) => Status): 'approved' | 'declined' | 'not-ready' {
  const all = g.cards.map((c) => status(c.id))
  if (all.includes('approved')) return 'approved'
  if (all.length > 0 && all.every((s) => s === 'declined')) return 'declined'
  return 'not-ready'
}

export type Eligibility = { ok: true; talkIds: string[]; cc: string[]; flags: string[] } | { ok: false; reason: string }

const isSent = (e: EmailDoc) => e.state === 'sent'
const isDecisionRule = (r: RecipientRule) => r === 'acceptance' || r === 'decline'
const isDecisionEmail = (e: EmailDoc) => isDecisionRule(e.rule)
const approvedIds = (g: SpeakerGroup, status: (id: string) => Status) =>
  g.cards.filter((c) => status(c.id) === 'approved').map((c) => c.id)
const coEmail = (c: Card) => c.coSpeaker?.email.trim().toLowerCase() ?? ''

// Approved talks no sent acceptance has covered yet; empty until the speaker has had a sent decision email
// (before that they belong in a batch). A decline never covers a talk that was approved later.
export function needsFollowUp(g: SpeakerGroup, status: (id: string) => Status, history: EmailDoc[]): string[] {
  const sent = history.filter(isSent)
  if (!sent.some(isDecisionEmail)) return []
  const covered = new Set(sent.filter((e) => e.rule === 'acceptance').flatMap((e) => e.talkIds))
  return approvedIds(g, status).filter((id) => !covered.has(id))
}

/** Emails in flight: not yet sent, but may be (or may have been). */
export const IN_FLIGHT: ReadonlySet<EmailDoc['state']> = new Set<EmailDoc['state']>(['scheduled', 'queued', 'sending', 'unknown'])

/** A reason to skip when another email of the same template, or another decision email, is already on its way. */
export function inFlightConflict(history: EmailDoc[], templateId: string | null, rule: RecipientRule): string | null {
  const pending = history.filter((e) => IN_FLIGHT.has(e.state))
  if (isDecisionRule(rule) && pending.some((e) => isDecisionRule(e.rule))) return 'Already has a decision email waiting to send'
  if (templateId !== null && pending.some((e) => e.templateId === templateId)) return 'Already has this email waiting to send'
  return null
}

const NOT_READY = 'Not ready: a talk is still pending or maybe'

// Whether this speaker can get an email under `rule`, and which talks it covers. `history` is this speaker's
// emails (only sent ones, manual included, count). `followUp` is the explicit one-speaker send: for acceptance it
// covers only the talks needing a follow-up, and for any template it allows a resend of the same template.
// `speakerKeys` is every speaker's key, needed to flag co-speakers who are also speakers.
export function eligibility(
  rule: RecipientRule, g: SpeakerGroup, status: (id: string) => Status, history: EmailDoc[],
  opts: { speakerKeys: ReadonlySet<string>; followUp?: boolean; templateId?: string | null },
): Eligibility {
  const d = decision(g, status)
  const sent = history.filter(isSent)
  let talkIds: string[]
  if (rule === 'acceptance') {
    if (d === 'not-ready') return { ok: false, reason: NOT_READY }
    if (d !== 'approved') return { ok: false, reason: 'No approved talk' }
    talkIds = approvedIds(g, status)
  } else if (rule === 'decline') {
    if (d === 'not-ready') return { ok: false, reason: NOT_READY }
    if (d !== 'declined') return { ok: false, reason: 'Has an approved talk' }
    talkIds = g.cards.map((c) => c.id)
  } else if (rule === 'approved') {
    talkIds = approvedIds(g, status)
    if (talkIds.length === 0) return { ok: false, reason: 'No approved talk' }
  } else {
    talkIds = g.cards.map((c) => c.id)
  }

  if (isDecisionRule(rule) && sent.some(isDecisionEmail)) {
    // Only an acceptance can follow up an earlier decision email.
    if (!(opts.followUp && rule === 'acceptance')) return { ok: false, reason: 'Already had a decision email' }
    talkIds = needsFollowUp(g, status, history)
    if (talkIds.length === 0) return { ok: false, reason: 'No talks need a follow-up' }
  }
  const templateId = opts.templateId ?? null
  if (!opts.followUp && templateId !== null && sent.some((e) => e.templateId === templateId)) {
    return { ok: false, reason: 'Already sent this template' }
  }

  const covered = g.cards.filter((c) => talkIds.includes(c.id))
  const own = g.email.trim().toLowerCase()
  const cc = [...new Set(covered.map(coEmail))].filter((e) => e !== '' && e !== own && e !== g.speakerKey)

  const flags: string[] = []
  const also = new Set<string>()
  for (const c of covered) {
    const e = coEmail(c)
    if (e !== '' && e !== g.speakerKey && opts.speakerKeys.has(e) && !also.has(e)) {
      also.add(e)
      flags.push(`Co-speaker ${c.coSpeaker!.firstName.trim() || e} is also a speaker`)
    }
  }
  const hasCo = (c: Card) => !!c.coSpeaker && (coEmail(c) !== '' || c.coSpeaker.firstName.trim() !== '')
  if (rule === 'acceptance' && g.cards.some((c) => status(c.id) === 'declined' && hasCo(c))) {
    flags.push('Co-speaker on a declined talk is not notified')
  }
  return { ok: true, talkIds, cc, flags }
}

// Speaker fill-ins for the talks an email covers, plus every event field by key.
export function fillInValues(g: SpeakerGroup, talkIds: string[], event: EventField[]): Record<string, string> {
  const talks = g.cards.filter((c) => talkIds.includes(c.id)).sort(compareSubmitted)
  const coNames: string[] = []
  for (const c of talks) {
    const name = c.coSpeaker ? `${c.coSpeaker.firstName} ${c.coSpeaker.lastName}`.trim() : ''
    if (name !== '' && !coNames.includes(name)) coNames.push(name)
  }
  const values: Record<string, string> = Object.fromEntries(event.map((f) => [f.key, f.value]))
  return Object.assign(values, {
    firstName: g.name.first,
    lastName: g.name.last,
    fullName: `${g.name.first} ${g.name.last}`.trim(),
    talkTitles: talks.map((c) => `• ${c.title}`).join('\n'),
    talkCount: String(talks.length),
    coSpeakerNames: coNames.join(', '),
  })
}
