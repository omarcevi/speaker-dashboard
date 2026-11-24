import { describe, expect, it } from 'vitest'
import { speakerGroups } from '../../../functions/src/email/recipients.ts'
import type { EmailDoc, Status } from '../../../functions/src/model.ts'
import { buildCards } from '../../../functions/src/shared/cards.ts'
import { blockedReason, canSend, istanbulDate, nameList, prepare, recipientRows, untickedExcept, visibleSelection, type Judge } from './send.ts'
import { fakeSub } from './testing.ts'

const ts = (ms: number) => ({ toMillis: () => ms })

function email(over: Partial<EmailDoc> = {}): EmailDoc {
  return {
    batchId: 'b1', speakerKey: 'ada@example.com', to: 'ada@example.com', cc: [], templateId: 'acc', templateName: 'Acceptance',
    rule: 'acceptance', isDecision: true, talkIds: [], subject: null, text: null, html: null, attachments: [], sendAt: ts(0), state: 'sent',
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

describe('visibleSelection', () => {
  const rows = recipientRows('acceptance', 'acc', groups, judge())
  it('takes ticked ready rows the filters show', () => {
    expect(visibleSelection(rows, new Set(), { decision: 'all', hideAlready: false })).toEqual({ selected: ['ada@example.com', 'dee@example.com'], hidden: 0 })
    expect(visibleSelection(rows, new Set(['dee@example.com']), { decision: 'all', hideAlready: false })).toEqual({ selected: ['ada@example.com'], hidden: 0 })
  })
  it('counts ticked rows a filter hides and leaves them out', () => {
    expect(visibleSelection(rows, new Set(), { decision: 'declined', hideAlready: false })).toEqual({ selected: [], hidden: 2 })
    expect(visibleSelection(rows, new Set(['ada@example.com']), { decision: 'not-ready', hideAlready: true })).toEqual({ selected: [], hidden: 1 })
  })
})

describe('untickedExcept', () => {
  it('starts a batch with only the chosen speaker ticked, everyone else listed but unticked', () => {
    const rows = recipientRows('acceptance', 'acc', groups, judge())
    const unticked = untickedExcept(groups.map((g) => g.speakerKey), 'dee@example.com')
    expect(unticked.has('dee@example.com')).toBe(false)
    expect(unticked.has('ada@example.com')).toBe(true)
    expect(visibleSelection(rows, unticked, { decision: 'all', hideAlready: false })).toEqual({ selected: ['dee@example.com'], hidden: 0 })
  })
  it('ticks everyone when no speaker was chosen', () => {
    expect(untickedExcept(groups.map((g) => g.speakerKey), null).size).toBe(0)
  })
})

describe('nameList', () => {
  it('lists up to five names, then the rest as a count', () => {
    expect(nameList(['Ada', 'Bo'])).toBe('Ada, Bo')
    expect(nameList(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toBe('A, B, C, D, E +2 more')
  })
})

describe('in-flight emails', () => {
  it('marks a decision template on its way when any decision email is still going out', () => {
    const history = [email({ speakerKey: 'ada@example.com', state: 'queued', templateId: 'dec', rule: 'decline' })]
    const ada = recipientRows('acceptance', 'acc', groups, judge(history)).find((r) => r.g.speakerKey === 'ada@example.com')!
    expect(ada.reason).toBe('Already on its way')
  })
  it('ignores failed emails', () => {
    const history = [email({ speakerKey: 'ada@example.com', state: 'failed' })]
    const ada = recipientRows('acceptance', 'acc', groups, judge(history)).find((r) => r.g.speakerKey === 'ada@example.com')!
    expect(ada.tab).toBe('ready')
  })
})

describe('prepare', () => {
  const fields = [{ key: 'venue', label: 'Venue', value: 'Hall A' }, { key: 'deadline', label: 'Deadline', value: '' }]
  const ada = groups.find((g) => g.speakerKey === 'ada@example.com')!
  const bo = groups.find((g) => g.speakerKey === 'bo@example.com')!

  it('renders a recipient who can get it', () => {
    const p = prepare('acceptance', { subject: 'Hi {{firstName}}', body: 'See you at {{venue}}' }, ada, judge(), fields,
      { templateId: 'acc', followUp: false, signatureHtml: '' })
    expect(canSend(p)).toBe(true)
    expect(p.cc).toEqual(['cy@example.com'])
    expect(p.values.venue).toBe('Hall A')
  })

  it('blocks a recipient with an empty or unknown fill-in', () => {
    const p = prepare('acceptance', { subject: 'Hi', body: '{{deadline}} {{nope}}' }, ada, judge(), fields, { templateId: 'acc', followUp: false, signatureHtml: '' })
    expect(canSend(p)).toBe(false)
    expect(blockedReason(p)).toBe("{{deadline}} is empty, {{nope}} isn't a known fill-in")
    expect(p.html).toBe('<p>{{deadline}} {{nope}}</p>')
  })

  it('blocks a recipient on a malformed fill-in', () => {
    const p = prepare('acceptance', { subject: 'Hi {{first name}}', body: 'x' }, ada, judge(), fields, { templateId: 'acc', followUp: false, signatureHtml: '' })
    expect(canSend(p)).toBe(false)
    expect(blockedReason(p)).toBe("{{first name}} isn't a valid fill-in")
  })

  it('blocks a recipient the rule refuses', () => {
    const p = prepare('acceptance', { subject: 'Hi', body: 'x' }, bo, judge(), fields, { templateId: 'acc', followUp: false, signatureHtml: '' })
    expect(blockedReason(p)).toBe('No approved talk')
  })

  it('lists only the uncovered talks on a follow-up', () => {
    const history = [email({ speakerKey: 'dee@example.com', templateId: 'dec', rule: 'decline', talkIds: ['d1'] })]
    const dee = groups.find((g) => g.speakerKey === 'dee@example.com')!
    const p = prepare('acceptance', { subject: 'Hi', body: '{{talkTitles}}' }, dee, judge(history), fields, { templateId: 'acc', followUp: true, signatureHtml: '' })
    expect(canSend(p)).toBe(true)
    expect(p.talkIds).toEqual(['d1'])
  })

  it('previews a template with html as escaped HTML with the signature', () => {
    const named = { ...ada, name: { ...ada.name, first: 'A<b>&"' } }
    const p = prepare('acceptance', { subject: 'Hi', body: 'ignored', html: '<p>Hi <strong>{{firstName}}</strong></p>' }, named, judge(), fields,
      { templateId: 'acc', followUp: false, signatureHtml: '<p>The DevFest team</p>' })
    expect(canSend(p)).toBe(true)
    expect(p.html).toBe('<p>Hi <strong>A&lt;b&gt;&amp;&quot;</strong></p><br><p>The DevFest team</p>')
  })

  it('previews a template without html from its body', () => {
    const p = prepare('acceptance', { subject: 'Hi', body: 'See you at {{venue}}' }, ada, judge(), fields,
      { templateId: 'acc', followUp: false, signatureHtml: '' })
    expect(p.html).toBe('<p>See you at Hall A</p>')
  })
})

describe('istanbulDate', () => {
  it('rolls over at Istanbul midnight', () => {
    expect(istanbulDate(Date.UTC(2026, 11, 1, 20, 59))).toBe('2026-12-01')
    expect(istanbulDate(Date.UTC(2026, 11, 1, 21, 0))).toBe('2026-12-02')
  })
})
