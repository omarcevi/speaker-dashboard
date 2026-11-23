import type { EmailDoc, ThreadDoc } from '../../../functions/src/model.ts'

// Event times are Istanbul time (UTC+3, no DST) whatever the browser's zone.
const ZONE = 'Europe/Istanbul'

const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: ZONE })
const shortDateTime = (ms: number) =>
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

/** The newest decision email that actually went out (manual included). */
export function lastDecisionEmail<T extends EmailDoc>(history: T[]): T | undefined {
  let best: T | undefined
  for (const e of history) {
    if (!e.isDecision || e.state !== 'sent') continue
    if (!best || (e.sentAt?.toMillis() ?? 0) > (best.sentAt?.toMillis() ?? 0)) best = e
  }
  return best
}

export function needsLook(e: EmailDoc, thread: ThreadDoc | undefined): boolean {
  if (e.bounce || e.state === 'held' || e.state === 'unknown' || e.state === 'failed') return true
  const reply = thread?.lastReplyAt?.toMillis()
  return reply !== undefined && reply > (thread?.lastTeamAt?.toMillis() ?? 0)
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
    return team > reply ? `Answered by the team · ${shortDateTime(team)}${snippet}` : `${firstName} replied · ${shortDateTime(reply)}${snippet}`
  }
  return 'No reply yet'
}
