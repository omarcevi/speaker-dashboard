import { fillInParts, fillInsIn, SPEAKER_FILL_INS } from '../../../functions/src/email/fillIns.ts'
import type { EmailDoc, EventField, RecipientRule, ThreadDoc } from '../../../functions/src/model.ts'
import { formatWhen } from './syncStatus.ts'

// Event times are Istanbul time (UTC+3, no DST) whatever the browser's zone.
const ZONE = 'Europe/Istanbul'

export const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: ZONE })
export const shortDateTime = (ms: number) =>
  `${shortDate(ms)}, ${new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ZONE })}`

/** "2026-12-05" and "09:00" read as Istanbul time, as epoch milliseconds. */
export function toIstanbulMs(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return Date.UTC(y, mo - 1, d, h - 3, mi)
}

/** Each speaker's emails, newest first. */
export function emailsBySpeaker<T extends EmailDoc>(emails: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const e of emails) {
    const list = map.get(e.speakerKey)
    if (list) list.push(e)
    else map.set(e.speakerKey, [e])
  }
  for (const list of map.values()) list.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
  return map
}

/** Bounced beats replied beats sent. */
export function stateLabel(e: EmailDoc): string {
  if (e.bounce) return 'Bounced'
  if (e.replyCount > 0) return `Replied (${e.replyCount})`
  switch (e.state) {
    case 'sent': return e.manual ? 'Sent outside' : e.sentAt ? `Sent ${shortDate(e.sentAt.toMillis())}` : 'Sent'
    case 'scheduled': return `Scheduled ${shortDateTime(e.sendAt.toMillis())}`
    case 'queued': return 'Queued'
    case 'sending': return 'Sending'
    case 'held': return e.reason ? `Held: ${e.reason}` : 'Held'
    case 'unknown': return 'May have been sent'
    case 'failed': return 'Failed'
    case 'cancelled': return 'Cancelled'
  }
}

const sentOrMade = (e: EmailDoc) => (e.sentAt ?? e.createdAt).toMillis()

/** The newest decision email that actually went out (manual included), by when it was sent or marked. */
export function lastDecisionEmail<T extends EmailDoc>(history: T[]): T | undefined {
  let best: T | undefined
  for (const e of history) {
    if (!e.isDecision || e.state !== 'sent') continue
    if (!best || sentOrMade(e) > sentOrMade(best)) best = e
  }
  return best
}

/** The speaker wrote after the team's last message. A tie counts as answered. */
export function speakerWroteLast(thread: ThreadDoc | undefined): boolean {
  const reply = thread?.lastReplyAt?.toMillis()
  return reply !== undefined && reply > (thread?.lastTeamAt?.toMillis() ?? 0)
}

export function needsLook(e: EmailDoc, thread: ThreadDoc | undefined): boolean {
  if (e.bounce || e.state === 'held' || e.state === 'unknown' || e.state === 'failed') return true
  return speakerWroteLast(thread)
}

export function latestLine(e: EmailDoc, thread: ThreadDoc | undefined, firstName: string): string {
  if (e.bounce) return `Not delivered · ${e.bounce.reason}`
  if (e.state === 'held') return e.reason ? `Held · ${e.reason}` : 'Held'
  if (e.state === 'unknown') return 'Check Gmail Sent · the dashboard lost track mid-send'
  if (e.state === 'failed') return e.reason ? `Failed · ${e.reason}` : 'Failed'
  if (e.state === 'cancelled') return 'Cancelled'
  if (e.state === 'scheduled' || e.state === 'queued' || e.state === 'sending') {
    return e.state === 'scheduled' ? `Goes out ${shortDateTime(e.sendAt.toMillis())}` : 'Goes out shortly'
  }
  if (e.manual) return 'Sent outside the dashboard, marked by hand'
  const reply = thread?.lastReplyAt?.toMillis()
  if (thread && reply !== undefined) {
    const team = thread.lastTeamAt?.toMillis() ?? 0
    const snippet = thread.lastSnippet ? ` · ${thread.lastSnippet}` : ''
    return !speakerWroteLast(thread) ? `Answered by the team · ${shortDateTime(team)}${snippet}` : `${firstName} replied · ${shortDateTime(reply)}${snippet}`
  }
  return 'No reply yet'
}

/** How a state chip looks: neutral tones only (the four colours stay with review status). */
export function stateTone(e: EmailDoc): '' | 'strong' | 'warn' | 'line' {
  if (e.bounce || e.state === 'held' || e.state === 'unknown' || e.state === 'failed') return 'warn'
  if (e.replyCount > 0) return 'strong'
  if (e.state === 'scheduled' || e.state === 'queued' || e.state === 'sending') return 'line'
  return ''
}

/** When the email or its conversation last moved, for "newest activity first". */
export function lastActivity(e: EmailDoc, thread: ThreadDoc | undefined): number {
  return Math.max(
    e.createdAt.toMillis(),
    e.state === 'scheduled' ? e.sendAt.toMillis() : 0,
    e.sentAt?.toMillis() ?? 0,
    e.bounce?.at.toMillis() ?? 0,
    thread?.lastReplyAt?.toMillis() ?? 0,
    thread?.lastTeamAt?.toMillis() ?? 0,
  )
}

/** A reply sent from the dashboard belongs to its conversation's row, unless something went wrong with it. */
export function isListed(e: EmailDoc): boolean {
  return e.replyToThreadId === null || needsLook(e, undefined)
}

/** An email's name in lists: its template's name, else the custom subject. */
export function emailTitle(e: EmailDoc): string {
  if (e.templateId !== null) return e.templateName || 'Email'
  return e.subject || e.request?.custom?.subject || 'Custom email'
}

/** The chip in a speaker's history. A held email's reason goes in the notice under it, not the chip. */
export const historyChipLabel = (e: EmailDoc): string => (e.state === 'held' ? 'Held' : stateLabel(e))

/** Who and when, under a row of a speaker's history. */
export function historyByLine(e: EmailDoc): string {
  const at = (e.sentAt ?? e.createdAt).toMillis()
  if (e.manual) return `Marked by ${e.byName} · ${shortDate(at)} · sent outside the dashboard`
  if (e.state === 'scheduled') return `Scheduled by ${e.byName}`
  const cc = e.cc.length > 0 ? ` · cc ${e.cc.join(', ')}` : ''
  const cancelled = e.state === 'cancelled' && e.reason ? ` · ${e.reason}` : ''
  return `${e.byName} · ${shortDateTime(at)}${cc}${cancelled}`
}

/** One speaker's emails for the talk page, newest first; replies sent from the dashboard live in their conversation. */
export function speakerHistory<T extends EmailDoc>(emails: T[], speakerKey: string): T[] {
  return emails.filter((e) => e.speakerKey === speakerKey && isListed(e)).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
}

/** The quiet talk-header line: "Emailed: Acceptance · 20 Nov". */
export const emailedLine = (e: EmailDoc): string => `Emailed: ${emailTitle(e)} · ${shortDate((e.sentAt ?? e.createdAt).toMillis())}`

/** "09:00": the time of day in Istanbul, for a time input. */
export const istanbulTime = (ms: number) => new Date(ms + 3 * 3600_000).toISOString().slice(11, 16)

/** Text split into plain parts and http(s) links. Trailing punctuation stays outside a link. */
export function linkParts(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = []
  let last = 0
  for (const m of text.matchAll(/https?:\/\/\S+/g)) {
    const url = m[0].replace(/[.,;:!?)]+$/, '')
    if (!/^https?:\/\/./.test(url)) continue
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: url, href: url })
    last = m.index + url.length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** "Ada Lovelace <ada@example.com>" → "Ada Lovelace"; a bare address stays as it is. */
export function displayName(from: string): string {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]*)>\s*$/.exec(from)
  if (!m) return from.trim()
  return m[1].trim() || m[2].trim()
}

/** A file name safe for a Storage path: letters, digits, dot, dash, underscore and space; other runs become '-'. */
export function safeFileName(name: string): string {
  const s = name.replace(/[^A-Za-z0-9._\- ]+/g, '-').trim()
  return s === '' || /^\.+$/.test(s) ? 'file' : s
}

/** The name people see for an attachment: kept as typed, minus path separators and control characters. */
export function displayFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const s = name.replace(/[/\\\u0000-\u001f\u007f]/g, '').trim()
  return s === '' ? 'file' : s
}

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** "Wi-Fi password" → "wiFiPassword": a fill-in key from an event setting's label. */
export function eventKeyOf(label: string): string {
  return label.trim().toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
    .replace(/^[^a-z]+/, '')
}

/** "just now", "3 min ago", "2 h ago", then the full date. */
export function ago(ms: number, now: number): string {
  const min = Math.floor((now - ms) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`
  return formatWhen(ms)
}

export type Segment = { kind: 'text'; text: string } | { kind: 'fill'; text: string } | { kind: 'bad'; text: string; why: 'unknown' | 'empty' | 'malformed' }

/** Text with each {{fill-in}} replaced by its value and marked, for the template preview. */
export function previewSegments(text: string, values: Record<string, string>): Segment[] {
  return fillInParts(text).map((p): Segment => {
    if (p.kind === 'text') return p
    if (p.kind === 'malformed') return { kind: 'bad', text: p.text, why: 'malformed' }
    if (!Object.prototype.hasOwnProperty.call(values, p.name)) return { kind: 'bad', text: p.text, why: 'unknown' }
    if (values[p.name].trim() === '') return { kind: 'bad', text: p.text, why: 'empty' }
    return { kind: 'fill', text: values[p.name] }
  })
}

/** Each recipient rule's name and what it means, in the order templates are listed. */
export const RULES: Record<RecipientRule, { label: string; about: string }> = {
  acceptance: { label: 'Acceptance', about: 'Speakers with an approved talk, once. Lists only the approved talks.' },
  decline: { label: 'Decline', about: 'Speakers whose talks were all declined, once.' },
  approved: { label: 'Approved speakers', about: 'Anyone with at least one approved talk.' },
  anyone: { label: 'Anyone', about: 'Any speaker, whatever their status. For one-off questions.' },
}
export const RULE_ORDER = Object.keys(RULES) as RecipientRule[]

/** Event settings a template uses that are empty, so its emails would not send. */
export function emptyEventFillIns(t: { subject: string; body: string }, fields: EventField[]): string[] {
  const empty = new Set(fields.filter((f) => f.value.trim() === '').map((f) => f.key))
  return fillInsIn(`${t.subject}\n${t.body}`).filter((n) => empty.has(n))
}

/** The fill-ins the message editor offers: the speaker's, then each event setting by its label. */
export const editorFillIns = (fields: EventField[]): { name: string; label: string }[] => [
  ...SPEAKER_FILL_INS.map((k) => ({ name: k, label: k })),
  ...fields.map((f) => ({ name: f.key, label: f.label || f.key })),
]

/** Fill-ins a template uses that are neither speaker fill-ins nor event settings; malformed ones as written. */
export function unknownFillIns(t: { subject: string; body: string }, fields: EventField[]): string[] {
  const known = new Set<string>([...SPEAKER_FILL_INS, ...fields.map((f) => f.key)])
  return fillInsIn(`${t.subject}\n${t.body}`).filter((n) => !known.has(n))
}

/** First non-empty lines of a bounce notice, capped, for showing why a message was not delivered. */
export function bounceSummary(text: string, max = 300): string {
  const out = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '').slice(0, 4).join('\n')
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out
}
