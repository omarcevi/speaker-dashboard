import { describe, expect, it } from 'vitest'
import { speakerGroups } from '../../../functions/src/email/recipients.ts'
import type { EmailDoc, Status } from '../../../functions/src/model.ts'
import { buildCards } from '../../../functions/src/shared/cards.ts'
import { blockedReason, canSend, istanbulDate, onItsWay, prepare, recipientRows, type Judge } from './send.ts'
import { fakeSub } from './testing.ts'

const ts = (ms: number) => ({ toMillis: () => ms })

function email(over: Partial<EmailDoc> = {}): EmailDoc {
  return {
    batchId: 'b1', speakerKey: 'ada@example.com', to: 'ada@example.com', cc: [], templateId: 'acc', templateName: 'Acceptance',
    rule: 'acceptance', isDecision: true, talkIds: [], subject: null, text: null, attachments: [], sendAt: ts(0), state: 'sent',
    reason: null, manual: false, replyToThreadId: null, gmailMessageId: null, threadId: null, rfcMessageId: null,
    claimedAt: null, sentAt: ts(0), bounce: null, replyCount: 0, lastReplyAt: null, by: 'u', byName: 'U', createdAt: ts(0), ...over,
  }
}

const subs = [
  fakeSub({ id: 'a1', row: 2, speakerKey: 'ada@example.com', firstName: 'Ada', email: 'ada@example.com',
    coSpeaker: { firstName: 'Cy', lastName: 'Co', email: 'cy@example.com', bio: '', phone: '', linkedin: '', x: '', instagram: '', photoUrl: '' } }),
  fakeSub({ id: 'b1', row: 3, speakerKey: 'bo@example.com', firstName: 'Bo', email: 'bo@example.com' }),
  fakeSub({ id: 'c1', row: 4, speakerKey: 'cem@example.com', firstName: 'Cem', email: 'cem@example.com' }),
  fakeSub({ id: 'd1', row: 5, speakerKey: 'dee@example.com', firstName: 'Dee', email: 'dee@example.com' }),
]
const groups = speakerGroups(buildCards(subs, () => false))
const statuses: Record<string, Status> = { a1: 'approved', b1: 'declined', c1: 'pending', d1: 'approved' }

function judge(history: EmailDoc[] = []): Judge {
  return {
    status: (id) => statuses[id] ?? 'pending',
    historyOf: (k) => history.filter((e) => e.speakerKey === k),
    speakerKeys: new Set(groups.map((g) => g.speakerKey)),
  }
}
const tabOf = (rows: ReturnType<typeof recipientRows>) => Object.fromEntries(rows.map((r) => [r.g.speakerKey, [r.tab, r.reason]]))

describe('recipientRows', () => {
  it('sorts speakers for an acceptance by decision', () => {
    const rows = tabOf(recipientRows('acceptance', 'acc', groups, judge()))
    expect(rows['ada@example.com']).toEqual(['ready', null])
    expect(rows['bo@example.com']).toEqual(['not', 'No approved talk'])
    expect(rows['cem@example.com'][0]).toBe('not')
    expect(rows['dee@example.com']).toEqual(['ready', null])
  })

  it('keeps the cc of a ready speaker', () => {
    const ada = recipientRows('acceptance', 'acc', groups, judge()).find((r) => r.g.speakerKey === 'ada@example.com')!
    expect(ada.cc).toEqual(['cy@example.com'])
  })

  it('puts a speaker who got the decline and is now approved under follow-up', () => {
    const history = [email({ speakerKey: 'dee@example.com', templateId: 'dec', rule: 'decline', talkIds: ['d1'] })]
    const dee = recipientRows('acceptance', 'acc', groups, judge(history)).find((r) => r.g.speakerKey === 'dee@example.com')!
    expect(dee.tab).toBe('follow')
    expect(dee.already).toBe(true)
  })

  it('marks a speaker covered by a sent acceptance as already got it', () => {
    const history = [email({ speakerKey: 'dee@example.com', talkIds: ['d1'], manual: true })]
    const dee = recipientRows('acceptance', 'acc', groups, judge(history)).find((r) => r.g.speakerKey === 'dee@example.com')!
    expect([dee.tab, dee.reason, dee.already]).toEqual(['not', 'Already had a decision email', true])
  })

  it('marks a speaker with an email of this template still going out as on its way', () => {
    const history = [email({ speakerKey: 'ada@example.com', state: 'scheduled' })]
    const ada = recipientRows('acceptance', 'acc', groups, judge(history)).find((r) => r.g.speakerKey === 'ada@example.com')!
    expect([ada.tab, ada.reason]).toEqual(['not', 'Already on its way'])
  })

  it('uses the approved rule for other templates', () => {
    const history = [email({ speakerKey: 'ada@example.com', templateId: 'info', rule: 'approved', isDecision: false })]
    const rows = tabOf(recipientRows('approved', 'info', groups, judge(history)))
    expect(rows['ada@example.com']).toEqual(['not', 'Already sent this template'])
    expect(rows['dee@example.com']).toEqual(['ready', null])
    expect(rows['cem@example.com']).toEqual(['not', 'No approved talk'])
  })
})

describe('onItsWay', () => {
  it('counts in-flight emails of the template, and any decision email for decision templates', () => {
    expect(onItsWay([email({ state: 'queued', templateId: 'dec', rule: 'decline' })], 'acc', 'acceptance')).toBe(true)
    expect(onItsWay([email({ state: 'queued', templateId: 'dec', rule: 'decline' })], 'info', 'approved')).toBe(false)
    expect(onItsWay([email({ state: 'unknown', templateId: 'info', rule: 'approved' })], 'info', 'approved')).toBe(true)
    expect(onItsWay([email({ state: 'failed', templateId: 'info', rule: 'approved' })], 'info', 'approved')).toBe(false)
  })
})

describe('prepare', () => {
  const fields = [{ key: 'venue', label: 'Venue', value: 'Hall A' }, { key: 'deadline', label: 'Deadline', value: '' }]
  const ada = groups.find((g) => g.speakerKey === 'ada@example.com')!
  const bo = groups.find((g) => g.speakerKey === 'bo@example.com')!

  it('renders a recipient who can get it', () => {
    const p = prepare('acceptance', { subject: 'Hi {{firstName}}', body: 'See you at {{venue}}' }, ada, judge(), fields,
      { templateId: 'acc', followUp: false })
    expect(canSend(p)).toBe(true)
    expect(p.cc).toEqual(['cy@example.com'])
    expect(p.values.venue).toBe('Hall A')
  })

  it('blocks a recipient with an empty or unknown fill-in', () => {
    const p = prepare('acceptance', { subject: 'Hi', body: '{{deadline}} {{nope}}' }, ada, judge(), fields, { templateId: 'acc', followUp: false })
    expect(canSend(p)).toBe(false)
    expect(blockedReason(p)).toBe("{{deadline}} is empty, {{nope}} isn't a known fill-in")
  })

  it('blocks a recipient the rule refuses', () => {
    const p = prepare('acceptance', { subject: 'Hi', body: 'x' }, bo, judge(), fields, { templateId: 'acc', followUp: false })
    expect(blockedReason(p)).toBe('No approved talk')
  })

  it('lists only the uncovered talks on a follow-up', () => {
    const history = [email({ speakerKey: 'dee@example.com', templateId: 'dec', rule: 'decline', talkIds: ['d1'] })]
    const dee = groups.find((g) => g.speakerKey === 'dee@example.com')!
    const p = prepare('acceptance', { subject: 'Hi', body: '{{talkTitles}}' }, dee, judge(history), fields, { templateId: 'acc', followUp: true })
    expect(canSend(p)).toBe(true)
    expect(p.talkIds).toEqual(['d1'])
  })
})

describe('istanbulDate', () => {
  it('rolls over at Istanbul midnight', () => {
    expect(istanbulDate(Date.UTC(2026, 11, 1, 20, 59))).toBe('2026-12-01')
    expect(istanbulDate(Date.UTC(2026, 11, 1, 21, 0))).toBe('2026-12-02')
  })
})
