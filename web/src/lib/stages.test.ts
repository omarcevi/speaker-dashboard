import { describe, expect, it } from 'vitest'
import { speakerGroups } from '../../../functions/src/email/recipients.ts'
import type { EmailDoc, Stage, Status, ThreadDoc } from '../../../functions/src/model.ts'
import { buildCards } from '../../../functions/src/shared/cards.ts'
import {
  cellLabel, cellTone, changedExceptions, dueLabel, markNote, newStage, readExceptions, readStages, toggled, rowFollow, rowMissing, sortRows, stageCell, stageCounts, stageRows, stageSummary, sendLink, stagesProblem, withTemplate,
  type Cell, type Exceptions, type StageRow,
} from './stages.ts'
import { fakeSub } from './testing.ts'

const ts = (ms: number) => ({ toMillis: () => ms })
const day = (d: number, h = 9, m = 10) => Date.UTC(2026, m, d, h)
const NOV4 = day(4)
const NOV3 = day(3)

function email(over: Partial<EmailDoc> = {}): EmailDoc {
  return {
    batchId: 'b1', speakerKey: 'ada@example.com', to: 'ada@example.com', cc: [], templateId: 'pres2', templateName: 'Presentation',
    rule: 'approved', isDecision: false, talkIds: [], subject: null, text: null, html: null, attachments: [], sendAt: ts(NOV4), state: 'sent',
    reason: null, manual: false, replyToThreadId: null, gmailMessageId: null, threadId: null, rfcMessageId: null,
    claimedAt: null, sentAt: ts(NOV4), bounce: null, replyCount: 0, lastReplyAt: null, by: 'u', byName: 'U', createdAt: ts(0), ...over,
  }
}
const at = (n: number): Partial<EmailDoc> => ({ sentAt: ts(n), sendAt: ts(n) })
const bounce = { reason: 'x', at: ts(1) }
const thread = (reply: number | null, team: number | null): ThreadDoc => ({
  speakerKey: 'ada@example.com', firstSentAt: ts(0), lastCheckedAt: null, seenIds: [], lastReplyAt: reply === null ? null : ts(reply),
  lastTeamAt: team === null ? null : ts(team), lastSnippet: '',
})

const today = '2026-12-02'
const pres: Stage = { id: 'pres', name: 'Presentation request', templateIds: ['pres2', 'pres1'], dueFrom: '2026-11-25', appliesTo: 'everyone' }
const none = new Map<string, ThreadDoc>()
const cell = (emails: EmailDoc[], o: { stage?: Partial<Stage>; ex?: Exceptions; threads?: Map<string, ThreadDoc>; key?: string; today?: string } = {}) =>
  stageCell({ stage: { ...pres, ...o.stage }, speakerKey: o.key ?? 'ada@example.com', exceptions: o.ex, emails, threads: o.threads ?? none, today: o.today ?? today })
const exc = (e: Partial<Exceptions>): Exceptions => ({ skipped: [], added: [], ...e })

describe('stageCell', () => {
  it('skippedBeatsEmail', () => { expect(cell([email()], { ex: exc({ skipped: ['pres'] }) }).kind).toBe('skipped') })
  it('addedStageNotAdded', () => {
    const stage = { appliesTo: 'added' as const }
    expect(cell([], { stage }).kind).toBe('notFor')
    expect(cell([], { stage, ex: exc({ added: ['pres'] }) }).kind).toBe('missing')
  })
  it('danglingExceptionIgnored', () => { expect(cell([], { ex: exc({ skipped: ['gone'], added: ['gone'] }) }).kind).toBe('missing') })
  it('bounced', () => { expect(cell([email({ bounce })]).kind).toBe('bounced') })
  it('problem', () => {
    for (const state of ['failed', 'unknown', 'held'] as const) expect(cell([email({ state })]).kind).toBe('problem')
  })
  it('answerNeeded', () => {
    expect(cell([email({ threadId: 't1' })], { threads: new Map([['t1', thread(10, 5)]]) }).kind).toBe('answer')
  })
  it('tieIsAnswered', () => {
    expect(cell([email({ threadId: 't1' })], { threads: new Map([['t1', thread(10, 10)]]) }).kind).toBe('replied')
  })
  it('replied', () => {
    expect(cell([email({ threadId: 't1' })], { threads: new Map([['t1', thread(5, 10)]]) }).kind).toBe('replied')
  })
  it('sent', () => {
    const c = cell([email()])
    expect(c.kind).toBe('sent')
    expect(cellLabel(c)).toBe('Sent 4 Nov')
  })
  it('manualNeverReplied', () => {
    const c = cell([email({ manual: true, threadId: null, ...at(NOV3) })])
    expect(c.kind).toBe('manual')
    expect(cellLabel(c)).toBe('Marked sent 3 Nov')
  })
  it('scheduled', () => {
    const sendAt = Date.UTC(2026, 11, 2, 6)
    const c = cell([email({ state: 'scheduled', sentAt: null, sendAt: ts(sendAt) })])
    expect(c.kind).toBe('scheduled')
    expect(c.at).toBe(sendAt)
    expect(cellLabel(c)).toBe('Scheduled 2 Dec')
    for (const state of ['queued', 'sending'] as const) {
      const s = cell([email({ state, sentAt: null })])
      expect(s.kind).toBe('sending')
      expect(cellLabel(s)).toBe('Sending')
    }
  })
  it('oldTemplateCounts', () => { expect(cell([email({ templateId: 'pres1' })]).kind).toBe('sent') })
  it('otherTemplateIgnored', () => { expect(cell([email({ templateId: 'acc' })]).kind).toBe('missing') })
  it('cancelledIgnored', () => {
    expect(cell([email({ state: 'cancelled', sentAt: null })]).kind).toBe('missing')
    expect(cell([email(at(10)), email({ state: 'cancelled', sentAt: null, sendAt: ts(20) })]).kind).toBe('sent')
  })
  it('successfulSendWins', () => {
    expect(cell([email(at(10)), email({ state: 'failed', ...at(20) })]).kind).toBe('sent')
    expect(cell([email({ bounce, ...at(5) }), email(at(10))]).kind).toBe('sent')
    const c = cell([email(at(5)), email({ bounce, ...at(20) })])
    expect(c.kind).toBe('sent')
    expect(c.at).toBe(5)
  })
  it('latestWhenNoSuccess', () => {
    expect(cell([email({ state: 'failed', ...at(10) }), email({ state: 'scheduled', sentAt: null, sendAt: ts(20) })]).kind).toBe('scheduled')
    expect(cell([email({ state: 'failed', ...at(10) }), email({ bounce, ...at(20) })]).kind).toBe('bounced')
  })
  it('dueOnTheDay', () => {
    expect(cell([], { stage: { dueFrom: '2026-12-02' } }).kind).toBe('missing')
    const due = cell([], { stage: { dueFrom: '2026-12-03' } })
    expect(due.kind).toBe('due')
    expect(cellLabel(due)).toBe('Due 3 Dec')
    const blank = cell([], { stage: { dueFrom: null } })
    expect(blank.kind).toBe('blank')
    expect(cellLabel(blank)).toBe('')
  })
  it('ccSuccessCounts', () => {
    expect(cell([email({ speakerKey: 'bob@example.com', to: 'bob@example.com', cc: ['Ada@Example.com'] })]).kind).toBe('sent')
  })
  it('ccProblemIgnored', () => {
    const base = { speakerKey: 'bob@example.com', to: 'bob@example.com', cc: ['Ada@Example.com'] }
    expect(cell([email({ ...base, bounce })]).kind).toBe('missing')
    expect(cell([email({ ...base, state: 'failed' })]).kind).toBe('missing')
  })
  it('unansweredReplyStaysOnCell', () => {
    const old = email({ templateId: 'pres1', threadId: 't1', ...at(10) })
    const newer = email({ threadId: 't2', ...at(20) })
    const threads = new Map([['t1', thread(15, 12)], ['t2', thread(null, null)]])
    const c = cell([old, newer], { threads })
    expect(c.kind).toBe('answer')
    expect(c.email).toBe(old)
  })
  it('ccThreadNeverMakesAnswerOrReplied', () => {
    const e = email({ speakerKey: 'bob@example.com', to: 'bob@example.com', cc: ['ada@example.com'], threadId: 't1' })
    const threads = new Map([['t1', thread(10, 5)]])
    const bob = cell([e], { threads, key: 'bob@example.com' })
    const ada = cell([e], { threads })
    expect([bob.kind, ada.kind]).toEqual(['answer', 'sent'])
    const mk = (cl: Cell, k: string) => ({ ...row(k), cells: { pres: cl } })
    expect(stageCounts([mk(bob, 'bob'), mk(ada, 'ada')], 'pres')).toEqual({ sent: 2, missing: 0, follow: 1 })
  })
  it('manualIgnoresThread', () => {
    const c = cell([email({ manual: true, threadId: 't1' })], { threads: new Map([['t1', thread(10, 5)]]) })
    expect(c.kind).toBe('manual')
  })
  it('tolerates malformed input', () => {
    const bad = { id: 'pres', name: 'x', appliesTo: 'everyone', dueFrom: undefined } as unknown as Stage
    expect(cell([email({ cc: undefined as never, templateId: null })], { stage: bad, ex: { skipped: 'x', added: null } as never }).kind).toBe('blank')
  })
})

const subs = [
  fakeSub({ id: 'a1', row: 2, speakerKey: 'ada@example.com', firstName: 'Ada', lastName: 'Zed', email: 'ada@example.com' }),
  fakeSub({ id: 'b1', row: 3, speakerKey: 'bo@example.com', firstName: 'Bo', email: 'bo@example.com' }),
  fakeSub({ id: 'c1', row: 4, speakerKey: 'cem@example.com', firstName: 'Cem', email: 'cem@example.com' }),
  fakeSub({ id: 'd1', row: 5, speakerKey: 'dee@example.com', firstName: 'Dee', email: 'dee@example.com' }),
  fakeSub({ id: 'e1', row: 6, speakerKey: 'eve@example.com', firstName: 'Eve', email: 'eve@example.com' }),
]
const groups = speakerGroups(buildCards(subs, () => false))
const statuses: Record<string, Status> = { a1: 'approved', b1: 'pending', c1: 'declined', d1: 'declined', e1: 'declined' }
const rowsOf = (emails: EmailDoc[], now = Date.UTC(2026, 11, 2, 12), stage: Stage = pres) =>
  stageRows({ stages: [stage], groups, status: (id) => statuses[id] ?? 'pending', emails, threads: none, exceptions: new Map(), now })

describe('stageRows', () => {
  it('whoAppears', () => {
    const rows = rowsOf([
      email({ speakerKey: 'cem@example.com', rule: 'acceptance', templateId: 'acc' }),
      email({ speakerKey: 'dee@example.com', rule: 'decline', templateId: 'dec' }),
      email({ speakerKey: 'eve@example.com', rule: 'acceptance', templateId: 'acc', state: 'scheduled', sentAt: null }),
    ])
    expect(rows.map((r) => [r.g.speakerKey, r.noApproved])).toEqual([['ada@example.com', false], ['cem@example.com', true]])
  })
  it('dueFlipsAtIstanbulMidnight', () => {
    const stage = { ...pres, dueFrom: '2026-12-02' }
    expect(rowsOf([], Date.UTC(2026, 11, 1, 20, 59), stage)[0].cells.pres.kind).toBe('due')
    expect(rowsOf([], Date.UTC(2026, 11, 1, 21, 0), stage)[0].cells.pres.kind).toBe('missing')
  })
  it('counts a CC on a sent email and ignores malformed stages', () => {
    const rows = stageRows({ stages: [pres, null as never, { id: 5 } as never], groups, status: (id) => statuses[id] ?? 'pending',
      emails: [email({ speakerKey: 'bo@example.com', to: 'bo@example.com', cc: ['ADA@example.com'] })], threads: none, exceptions: new Map(), now: Date.UTC(2026, 11, 2, 12) })
    expect(Object.keys(rows[0].cells)).toEqual(['pres'])
    expect(rows[0].cells.pres.kind).toBe('sent')
  })
})

const c = (kind: Cell['kind']): Cell => ({ kind, at: null, email: null })
const row = (name: string, ...kinds: Cell['kind'][]): StageRow => ({
  g: { speakerKey: name, name: { first: name, last: '' }, email: name, cards: [] }, noApproved: false,
  cells: Object.fromEntries(kinds.map((k, i) => [i === 0 ? 'pres' : `s${i}`, c(k)])),
})

describe('rows and counts', () => {
  it('sortRows', () => {
    const rows = [row('Zed', 'sent'), row('Bea', 'sent'), row('Yan', 'missing'), row('Cal', 'missing'), row('Xia', 'bounced'), row('Abe', 'answer', 'missing')]
    expect(sortRows(rows).map((r) => r.g.name.first)).toEqual(['Abe', 'Xia', 'Cal', 'Yan', 'Bea', 'Zed'])
    expect(rowMissing(rows[3])).toBe(true)
    expect(rowFollow(rows[3])).toBe(false)
  })
  it('stageCounts', () => {
    const rows = (['sent', 'manual', 'answer', 'missing', 'bounced', 'skipped'] as const).map((k, i) => row(`n${i}`, k))
    expect(stageCounts(rows, 'pres')).toEqual({ sent: 3, missing: 1, follow: 2 })
  })
  it('stageSummary', () => {
    const f = '2026-12-11'
    expect(stageSummary(pres, { sent: 20, missing: 2, follow: 0 }, today)).toBe('20 sent · 2 missing')
    expect(stageSummary({ ...pres, dueFrom: f }, { sent: 0, missing: 0, follow: 0 }, today)).toBe('due 11 Dec')
    expect(stageSummary({ ...pres, dueFrom: null }, { sent: 0, missing: 0, follow: 0 }, today)).toBe('no due date')
    expect(stageSummary({ ...pres, dueFrom: f }, { sent: 3, missing: 0, follow: 0 }, today)).toBe('3 sent · due 11 Dec')
    expect(stageSummary(pres, { sent: 3, missing: 0, follow: 0 }, today)).toBe('3 sent')
    expect(stageSummary(pres, { sent: 0, missing: 4, follow: 0 }, today)).toBe('4 missing')
    expect(stageSummary(pres, { sent: 0, missing: 0, follow: 0 }, today)).toBe('0 sent')
  })
  it('stageSummaryCountsFollowUps', () => {
    expect(stageSummary(pres, { sent: 2, missing: 0, follow: 1 }, today)).toBe('2 sent · 1 needs follow-up')
    expect(stageSummary(pres, { sent: 0, missing: 0, follow: 1 }, today)).toBe('1 needs follow-up')
    expect(stageSummary(pres, { sent: 3, missing: 1, follow: 2 }, today)).toBe('3 sent · 1 missing · 2 need follow-up')
    expect(stageSummary({ ...pres, dueFrom: '2026-12-11' }, { sent: 1, missing: 0, follow: 1 }, today)).toBe('1 sent · 1 needs follow-up · due 11 Dec')
    expect(stageSummary(pres, { sent: 3, missing: 0, follow: 0 }, today)).toBe('3 sent')
  })
  it('labels and tones', () => {
    expect(dueLabel('2026-12-01')).toBe('1 Dec')
    expect(cellLabel(c('answer'))).toBe('Replied – needs an answer')
    expect(cellTone(c('missing'))).toBe('warn')
    expect(cellTone(c('replied'))).toBe('strong')
    expect(cellTone(c('sending'))).toBe('line')
    expect(cellTone(c('skipped'))).toBe('faint')
    expect(cellTone(c('notFor'))).toBe('faint')
    expect(cellTone(c('sent'))).toBe('')
  })
})

describe('loading stages', () => {
  it('readStages tolerates malformed data', () => {
    expect(readStages(undefined)).toEqual([])
    expect(readStages({ stages: [{ id: 's', name: 'A', templateIds: 'x', dueFrom: '1 Dec', appliesTo: 'weird' }, { name: 'no id' }] }))
      .toEqual([{ id: 's', name: 'A', templateIds: [], dueFrom: null, appliesTo: 'everyone' }])
  })
  it('readStages keeps valid values', () => {
    expect(readStages({ stages: [{ id: 's', name: 'A', templateIds: ['t', 3], dueFrom: '2026-12-01', appliesTo: 'added' }] }))
      .toEqual([{ id: 's', name: 'A', templateIds: ['t'], dueFrom: '2026-12-01', appliesTo: 'added' }])
  })
  it('readStagesKeepsFirstOfDuplicateIds', () => {
    expect(readStages({ stages: [{ id: 's', name: 'A' }, { id: 's', name: 'B' }, { id: 't', name: 'C' }] }).map((x) => x.name)).toEqual(['A', 'C'])
  })
  it('readStagesDropsImpossibleDates', () => {
    const due = (dueFrom: string) => readStages({ stages: [{ id: 's', name: 'A', dueFrom }] })[0].dueFrom
    expect(due('2026-02-30')).toBeNull()
    expect(due('2026-13-01')).toBeNull()
    expect(due('2026-00-10')).toBeNull()
    expect(due('2027-02-29')).toBeNull()
    expect(due('2028-02-29')).toBe('2028-02-29')
    expect(due('2026-12-31')).toBe('2026-12-31')
  })
  it('readExceptions drops non-strings and non-lists', () => {
    expect(readExceptions({ skipped: ['a', 3], added: 'b' })).toEqual({ skipped: ['a'], added: [] })
    expect(readExceptions(null)).toEqual({ skipped: [], added: [] })
  })
  it('changedExceptionsDropsRemovedStages', () => {
    const current = { skipped: ['gone', 'a'], added: ['old', 'b'] }
    expect(changedExceptions(current, ['a', 'b', 'c'], 'c', 'skipped', true)).toEqual({ skipped: ['a', 'c'], added: ['b'] })
    expect(changedExceptions(current, ['a', 'b'], 'b', 'added', false)).toEqual({ skipped: ['a'], added: [] })
    expect(changedExceptions(current, ['a'], 'gone', 'skipped', true)).toEqual({ skipped: ['a'], added: [] })
  })
  it('toggled adds once and removes all', () => {
    expect(toggled(['a'], 'a', true)).toEqual(['a'])
    expect(toggled(['a', 'b'], 'a', false)).toEqual(['b'])
    expect(toggled(['a', 'b', 'a'], 'a', false)).toEqual(['b'])
    expect(toggled(['a'], 'b', true)).toEqual(['a', 'b'])
  })
})

describe('manage stages helpers', () => {
  it('withTemplateKeepsSavedHistory', () => {
    expect(withTemplate({ ...pres }, 'pres3', [pres]).templateIds).toEqual(['pres3', 'pres2', 'pres1'])
    expect(withTemplate(pres, 'pres1', [pres]).templateIds).toEqual(['pres1', 'pres2'])
  })
  it('withTemplateOnSavedStageAddsOnlySavedTemplates', () => {
    const saved: Stage = { ...pres, templateIds: ['A'] }
    expect(withTemplate(saved, 'B', [saved]).templateIds).toEqual(['B', 'A'])
  })
  it('withTemplateBackAndForthEndsAsSaved', () => {
    const saved: Stage = { ...pres, templateIds: ['A', 'old'] }
    const other: Stage = { ...pres, id: 'other', templateIds: ['B', 'Z'] }
    const b = withTemplate(saved, 'B', [other, saved])
    expect(b.templateIds).toEqual(['B', 'A', 'old'])
    const c = withTemplate(b, 'C', [other, saved])
    expect(c.templateIds).toEqual(['C', 'A', 'old']) // B was never saved on this stage: no history for it
    expect(withTemplate(c, 'A', [other, saved])).toEqual(saved)
  })
  it('withTemplateOnNewStageKeepsOneTemplate', () => {
    const live: Stage[] = [{ ...pres, id: 'acc', templateIds: ['acceptance'] }]
    const fresh = newStage('x', 'acceptance')
    const picked = withTemplate(fresh, 'event-info', live)
    expect(picked.templateIds).toEqual(['event-info'])
    expect(withTemplate(picked, 'visa', live).templateIds).toEqual(['visa'])
    expect(withTemplate(picked, 'acceptance', live).templateIds).toEqual(['acceptance'])
  })
  it('stagesProblem names the first problem', () => {
    expect(stagesProblem([{ ...pres, name: '  ' }])).toBe('Every stage needs a name')
    expect(stagesProblem([{ ...pres, templateIds: [] }])).toBe('Pick a template for Presentation request')
    expect(stagesProblem([pres])).toBeNull()
    const many = Array.from({ length: 31 }, (_, i) => ({ ...pres, id: `s${i}`, templateIds: [`t${i}`] }))
    expect(stagesProblem(many)).toBe('At most 30 stages')
  })
  it('stagesProblemRefusesSharedTemplate', () => {
    const templates = [{ id: 'pres1', name: 'Event info' }]
    const other: Stage = { ...pres, id: 'visa', name: 'Visa letter', templateIds: ['visa', 'pres1'] }
    expect(stagesProblem([pres, other], templates)).toBe('“Event info” is used by two stages')
    expect(stagesProblem([pres, { ...other, templateIds: ['pres2'] }], [])).toBe('“pres2” is used by two stages') // deleted template
    expect(stagesProblem([pres, { ...other, templateIds: ['visa'] }], templates)).toBeNull()
  })
  it('newStage starts blank on one template', () => {
    expect(newStage('x', 't1')).toEqual({ id: 'x', name: '', templateIds: ['t1'], dueFrom: null, appliesTo: 'everyone' })
  })
})

describe('cell actions', () => {
  it('sendLink puts every speaker in the query', () => {
    expect(sendLink('t 1', ['a+b@example.com', 'c@example.com'])).toBe('/emails/templates/t%201/send?speaker=a%2Bb%40example.com&speaker=c%40example.com')
  })
  it('markNote says what was marked', () => {
    expect(markNote(1, 'Ada', 'Event info', null)).toBe('Marked Event info as already sent for Ada.')
  })
  it('markNoteRefused', () => {
    expect(markNote(0, 'Ada', 'Event info', 'Not an approved speaker')).toBe('Not marked: Not an approved speaker')
    expect(markNote(0, 'Ada', 'Event info', null)).toBe('Not marked: Ada already has this email on its way')
  })
})
