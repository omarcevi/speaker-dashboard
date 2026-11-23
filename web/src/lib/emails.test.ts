import { describe, expect, it } from 'vitest'
import type { EmailDoc, ThreadDoc } from '../../../functions/src/model.ts'
import { emailsBySpeaker, lastDecisionEmail, latestLine, needsLook, stateLabel, toIstanbulMs } from './emails.ts'

const ts = (ms: number) => ({ toMillis: () => ms })

function email(over: Partial<EmailDoc> = {}): EmailDoc {
  return {
    batchId: 'b1', speakerKey: 'ada@example.com', to: 'ada@example.com', cc: [], templateId: 't1', templateName: 'Acceptance',
    rule: 'acceptance', isDecision: true, talkIds: [], subject: null, text: null, attachments: [], sendAt: ts(0), state: 'sent',
    reason: null, manual: false, replyToThreadId: null, gmailMessageId: null, threadId: 'th1', rfcMessageId: null,
    claimedAt: null, sentAt: ts(Date.UTC(2026, 10, 20, 8, 0)), bounce: null, replyCount: 0, lastReplyAt: null,
    by: 'u', byName: 'U', createdAt: ts(0), ...over,
  }
}

function thread(over: Partial<ThreadDoc> = {}): ThreadDoc {
  return { speakerKey: 'ada@example.com', firstSentAt: ts(0), lastCheckedAt: null, seenIds: [], lastReplyAt: null, lastTeamAt: null, lastSnippet: '', ...over }
}

const REPLY = Date.UTC(2026, 10, 19, 6, 12) // 09:12 in Istanbul
const TEAM = Date.UTC(2026, 10, 19, 8, 30) // 11:30

describe('toIstanbulMs', () => {
  it('reads date and time as Istanbul time', () => {
    expect(toIstanbulMs('2026-12-05', '09:00')).toBe(Date.UTC(2026, 11, 5, 6, 0))
  })
})

describe('emailsBySpeaker', () => {
  it('groups by speaker, newest first', () => {
    const a = email({ createdAt: ts(1) })
    const b = email({ createdAt: ts(3) })
    const c = email({ createdAt: ts(2), speakerKey: 'bo@example.com' })
    const m = emailsBySpeaker([a, b, c])
    expect(m.get('ada@example.com')).toEqual([b, a])
    expect(m.get('bo@example.com')).toEqual([c])
  })
})

describe('stateLabel', () => {
  it('labels each state', () => {
    expect(stateLabel(email())).toBe('Sent 20 Nov')
    expect(stateLabel(email({ manual: true }))).toBe('Sent outside')
    expect(stateLabel(email({ replyCount: 2 }))).toBe('Replied (2)')
    expect(stateLabel(email({ replyCount: 2, bounce: { reason: 'x', at: ts(0) } }))).toBe('Bounced')
    expect(stateLabel(email({ state: 'scheduled', sendAt: ts(Date.UTC(2026, 10, 24, 6, 0)), sentAt: null }))).toBe('Scheduled 24 Nov, 09:00')
    expect(stateLabel(email({ state: 'held', reason: 'No address' }))).toBe('Held: No address')
    expect(stateLabel(email({ state: 'unknown' }))).toBe('May have been sent')
    expect(stateLabel(email({ state: 'failed' }))).toBe('Failed')
    expect(stateLabel(email({ state: 'cancelled' }))).toBe('Cancelled')
    expect(stateLabel(email({ state: 'queued' }))).toBe('Queued')
    expect(stateLabel(email({ state: 'sending' }))).toBe('Sending')
  })
})

describe('needsLook', () => {
  it('is true for a reply after the team', () => {
    expect(needsLook(email(), thread({ lastReplyAt: ts(REPLY), lastTeamAt: ts(REPLY - 1) }))).toBe(true)
    expect(needsLook(email(), thread({ lastReplyAt: ts(REPLY) }))).toBe(true)
  })
  it('is false once the team answered or with no reply', () => {
    expect(needsLook(email(), thread({ lastReplyAt: ts(REPLY), lastTeamAt: ts(TEAM) }))).toBe(false)
    expect(needsLook(email(), thread())).toBe(false)
    expect(needsLook(email(), undefined)).toBe(false)
  })
  it('is true for bounced, held, unknown and failed', () => {
    expect(needsLook(email({ bounce: { reason: 'x', at: ts(0) } }), undefined)).toBe(true)
    expect(needsLook(email({ state: 'held' }), undefined)).toBe(true)
    expect(needsLook(email({ state: 'unknown' }), undefined)).toBe(true)
    expect(needsLook(email({ state: 'failed' }), undefined)).toBe(true)
  })
})

describe('latestLine', () => {
  it('shows the speaker reply', () => {
    expect(latestLine(email(), thread({ lastReplyAt: ts(REPLY), lastTeamAt: ts(REPLY - 1), lastSnippet: 'Thanks!' }), 'Priya'))
      .toBe('Priya replied · 19 Nov, 09:12 · Thanks!')
  })
  it('shows the team answer', () => {
    expect(latestLine(email(), thread({ lastReplyAt: ts(REPLY), lastTeamAt: ts(TEAM), lastSnippet: 'See you' }), 'Priya'))
      .toBe('Answered by the team · 19 Nov, 11:30 · See you')
  })
  it('shows no reply yet', () => {
    expect(latestLine(email(), thread(), 'Priya')).toBe('No reply yet')
    expect(latestLine(email(), undefined, 'Priya')).toBe('No reply yet')
  })
  it('shows problems and plans', () => {
    expect(latestLine(email({ bounce: { reason: 'Mailbox full', at: ts(0) } }), undefined, 'Priya')).toBe('Not delivered · Mailbox full')
    expect(latestLine(email({ state: 'held', reason: 'No address' }), undefined, 'Priya')).toBe('Held · No address')
    expect(latestLine(email({ state: 'unknown' }), undefined, 'Priya')).toBe('Check Gmail Sent · the dashboard lost track mid-send')
    expect(latestLine(email({ manual: true }), undefined, 'Priya')).toBe('Sent outside the dashboard, marked by hand')
    expect(latestLine(email({ state: 'scheduled', sendAt: ts(Date.UTC(2026, 10, 24, 6, 0)) }), undefined, 'Priya')).toBe('Goes out 24 Nov, 09:00')
  })
})

describe('lastDecisionEmail', () => {
  it('returns the newest sent decision email', () => {
    const old = email({ sentAt: ts(1) })
    const recent = email({ sentAt: ts(5) })
    const other = email({ isDecision: false, sentAt: ts(9) })
    const pending = email({ state: 'scheduled', sentAt: null })
    expect(lastDecisionEmail([old, other, recent, pending])).toBe(recent)
    expect(lastDecisionEmail([other, pending])).toBeUndefined()
  })
})
