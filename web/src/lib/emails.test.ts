import { describe, expect, it } from 'vitest'
import type { EmailDoc, ThreadDoc } from '../../../functions/src/model.ts'
import {
  ago, bounceSummary, displayFileName, displayName, emptyEventFillIns, unknownFillIns, emailsBySpeaker, eventKeyOf, formatBytes, isListed, lastActivity, lastDecisionEmail, latestLine, linkParts, needsLook,
  previewSegments, safeFileName, speakerWroteLast, stateLabel, stateTone, toIstanbulMs,
  emailTitle, historyChipLabel, usesSignatureLayout, historyByLine, speakerHistory, emailedLine, istanbulTime,
} from './emails.ts'

const ts = (ms: number) => ({ toMillis: () => ms })

function email(over: Partial<EmailDoc> = {}): EmailDoc {
  return {
    batchId: 'b1', speakerKey: 'ada@example.com', to: 'ada@example.com', cc: [], templateId: 't1', templateName: 'Acceptance',
    rule: 'acceptance', isDecision: true, talkIds: [], subject: null, text: null, html: null, attachments: [], sendAt: ts(0), state: 'sent',
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
  it('counts a tie as answered, like needsLook', () => {
    const t = thread({ lastReplyAt: ts(REPLY), lastTeamAt: ts(REPLY), lastSnippet: 'Ok' })
    expect(latestLine(email(), t, 'Priya')).toBe('Answered by the team · 19 Nov, 09:12 · Ok')
    expect(needsLook(email(), t)).toBe(false)
    expect(speakerWroteLast(t)).toBe(false)
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

  it('ranks a manual mark without sentAt by when it was made', () => {
    const sent = email({ sentAt: ts(10), createdAt: ts(5) })
    const marked = email({ manual: true, sentAt: null, createdAt: ts(20) })
    expect(lastDecisionEmail([sent, marked])).toBe(marked)
    expect(lastDecisionEmail([marked, sent])).toBe(marked)
  })
})

describe('stateTone', () => {
  it('keeps chips neutral by kind', () => {
    expect(stateTone(email())).toBe('')
    expect(stateTone(email({ replyCount: 1 }))).toBe('strong')
    expect(stateTone(email({ replyCount: 1, bounce: { reason: 'x', at: ts(0) } }))).toBe('warn')
    expect(stateTone(email({ state: 'held' }))).toBe('warn')
    expect(stateTone(email({ state: 'scheduled' }))).toBe('line')
  })
})

describe('lastActivity', () => {
  it('takes the newest of send, reply and team times', () => {
    expect(lastActivity(email({ createdAt: ts(1), sentAt: ts(5) }), undefined)).toBe(5)
    expect(lastActivity(email({ createdAt: ts(1), sentAt: ts(5) }), thread({ lastReplyAt: ts(9), lastTeamAt: ts(7) }))).toBe(9)
    expect(lastActivity(email({ state: 'scheduled', createdAt: ts(1), sentAt: null, sendAt: ts(20) }), undefined)).toBe(20)
  })
})

describe('isListed', () => {
  it('folds dashboard replies into their conversation unless they need a look', () => {
    expect(isListed(email())).toBe(true)
    expect(isListed(email({ replyToThreadId: 'th1' }))).toBe(false)
    expect(isListed(email({ replyToThreadId: 'th1', state: 'failed' }))).toBe(true)
  })
})

describe('linkParts', () => {
  it('splits out links and leaves trailing punctuation', () => {
    expect(linkParts('See https://example.com/a. Thanks')).toEqual([
      { text: 'See ' }, { text: 'https://example.com/a', href: 'https://example.com/a' }, { text: '. Thanks' },
    ])
    expect(linkParts('no links')).toEqual([{ text: 'no links' }])
    expect(linkParts('')).toEqual([])
  })
})

describe('displayName', () => {
  it('reads the name from a From header', () => {
    expect(displayName('Ada Lovelace <ada@example.com>')).toBe('Ada Lovelace')
    expect(displayName('"Ada L." <ada@example.com>')).toBe('Ada L.')
    expect(displayName('<ada@example.com>')).toBe('ada@example.com')
    expect(displayName('ada@example.com')).toBe('ada@example.com')
  })
})

describe('safeFileName', () => {
  it('keeps safe characters and collapses the rest', () => {
    expect(safeFileName('Slide template (v2).pptx')).toBe('Slide template -v2-.pptx')
    expect(safeFileName('a/../b.pdf')).toBe('a-..-b.pdf')
    expect(safeFileName('Şişli harita.pdf')).toBe('-i-li harita.pdf')
    expect(safeFileName('///')).toBe('-')
    expect(safeFileName('..')).toBe('file')
  })
})

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(640 * 1024)).toBe('640 KB')
    expect(formatBytes(4.2 * 1024 * 1024)).toBe('4.2 MB')
  })
})

describe('eventKeyOf', () => {
  it('derives a camelCase key from a label', () => {
    expect(eventKeyOf('Wi-Fi password')).toBe('wiFiPassword')
    expect(eventKeyOf('  Speaker check-in ')).toBe('speakerCheckIn')
    expect(eventKeyOf('2nd venue')).toBe('ndVenue')
    expect(eventKeyOf('')).toBe('')
  })
})

describe('ago', () => {
  it('says how long ago', () => {
    const now = Date.UTC(2026, 10, 24, 12, 0)
    expect(ago(now - 20_000, now)).toBe('just now')
    expect(ago(now - 3 * 60_000, now)).toBe('3 min ago')
    expect(ago(now - 125 * 60_000, now)).toBe('2 h ago')
    expect(ago(now - 3 * 86_400_000, now)).toMatch(/2026/)
  })
})

describe('previewSegments', () => {
  it('marks filled, unknown and empty fill-ins', () => {
    expect(previewSegments('Hi {{ firstName }}, {{venue}} {{nope}}!', { firstName: 'Ada', venue: ' ' })).toEqual([
      { kind: 'text', text: 'Hi ' }, { kind: 'fill', text: 'Ada' }, { kind: 'text', text: ', ' },
      { kind: 'bad', text: '{{venue}}', why: 'empty' }, { kind: 'text', text: ' ' },
      { kind: 'bad', text: '{{nope}}', why: 'unknown' }, { kind: 'text', text: '!' },
    ])
  })
  it('marks malformed fill-ins', () => {
    expect(previewSegments('Hi {{first name}} {{firstName}', { firstName: 'Ada' })).toEqual([
      { kind: 'text', text: 'Hi ' }, { kind: 'bad', text: '{{first name}}', why: 'malformed' }, { kind: 'text', text: ' ' },
      { kind: 'bad', text: '{{firstName}', why: 'malformed' },
    ])
  })
})

describe('emptyEventFillIns and unknownFillIns', () => {
  const fields = [{ key: 'venue', label: 'Venue', value: '' }, { key: 'eventName', label: 'Event name', value: 'DevFest' }]
  it('finds empty event settings and unknown names', () => {
    const t = { subject: '{{eventName}}', body: 'Hi {{firstName}}, at {{venue}} {{wifi}}' }
    expect(emptyEventFillIns(t, fields)).toEqual(['venue'])
    expect(unknownFillIns(t, fields)).toEqual(['wifi'])
  })
  it('lists malformed fill-ins as unknown, as written', () => {
    expect(unknownFillIns({ subject: '{{ }}', body: 'Hi {{first name}}' }, fields)).toEqual(['{{ }}', '{{first name}}'])
  })
})

describe('displayFileName', () => {
  it('keeps the name as typed, minus separators and control characters', () => {
    expect(displayFileName(' Şişli harita.pdf ')).toBe('Şişli harita.pdf')
    expect(displayFileName('a/b\\c\u0007.pdf')).toBe('abc.pdf')
    expect(displayFileName('//')).toBe('file')
  })
})

describe('talk page history helpers', () => {
  it('names an email by its template, else its subject', () => {
    expect(emailTitle(email())).toBe('Acceptance')
    expect(emailTitle(email({ templateId: null, templateName: '', subject: 'Slot question' }))).toBe('Slot question')
    expect(emailTitle(email({ templateId: null, templateName: '', subject: null, request: { followUp: false, includeCc: false, custom: { subject: 'Later', body: 'b' } } }))).toBe('Later')
    expect(emailTitle(email({ templateId: null, templateName: '', subject: null }))).toBe('Custom email')
  })

  it('keeps the held reason out of the history chip', () => {
    expect(historyChipLabel(email({ state: 'held', reason: 'No address' }))).toBe('Held')
    expect(historyChipLabel(email())).toBe('Sent 20 Nov')
  })

  it('says who sent it and when', () => {
    expect(historyByLine(email({ byName: 'Ada' }))).toBe('Ada · 20 Nov, 11:00')
    expect(historyByLine(email({ byName: 'Ada', cc: ['co@example.com', 'two@example.com'] }))).toBe('Ada · 20 Nov, 11:00 · cc co@example.com, two@example.com')
    expect(historyByLine(email({ byName: 'Ada', manual: true }))).toBe('Marked by Ada · 20 Nov · sent outside the dashboard')
    expect(historyByLine(email({ byName: 'Ada', state: 'scheduled', sentAt: null }))).toBe('Scheduled by Ada')
    expect(historyByLine(email({ byName: 'Ada', state: 'cancelled', sentAt: null, createdAt: ts(Date.UTC(2026, 10, 21, 9, 5)), reason: 'Cancelled by Bo' })))
      .toBe('Ada · 21 Nov, 12:05 · Cancelled by Bo')
  })

  it('lists a speaker\'s emails newest first, replies folded into their conversation', () => {
    const a = email({ createdAt: ts(1) })
    const b = email({ createdAt: ts(3) })
    const reply = email({ createdAt: ts(4), replyToThreadId: 'th1' })
    const failedReply = email({ createdAt: ts(5), replyToThreadId: 'th1', state: 'failed' })
    const other = email({ createdAt: ts(2), speakerKey: 'bo@example.com' })
    expect(speakerHistory([a, b, reply, failedReply, other], 'ada@example.com')).toEqual([failedReply, b, a])
  })

  it('writes the header line from the last decision email', () => {
    expect(emailedLine(email())).toBe('Emailed: Acceptance · 20 Nov')
    expect(emailedLine(email({ manual: true, sentAt: null, createdAt: ts(Date.UTC(2026, 10, 18, 22, 0)) }))).toBe('Emailed: Acceptance · 19 Nov')
  })

  it('reads a time of day in Istanbul', () => {
    expect(istanbulTime(Date.UTC(2026, 11, 5, 6, 0))).toBe('09:00')
    expect(istanbulTime(Date.UTC(2026, 11, 5, 21, 30))).toBe('00:30')
  })
})

describe('bounceSummary', () => {
  it('keeps the first non-empty lines and drops blanks', () => {
    expect(bounceSummary('\n  Address not found \n\n550 No such user\n')).toBe('Address not found\n550 No such user')
  })
  it('caps long text with an ellipsis', () => {
    const out = bounceSummary('x'.repeat(500))
    expect(out.length).toBe(300)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('usesSignatureLayout', () => {
  it('spotsTablesAndStyles', () => {
    expect(usesSignatureLayout('<TABLE><tr><td>x</td></tr></table>')).toBe(true)
    expect(usesSignatureLayout('<span style="color:red">x</span>')).toBe(true)
    expect(usesSignatureLayout('<p><b>The team</b> <a href="https://x.test">x.test</a></p>')).toBe(false)
    expect(usesSignatureLayout('<p>Our tables and style= notes</p>')).toBe(false)
  })
})
