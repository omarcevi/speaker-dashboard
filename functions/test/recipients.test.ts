import { describe, expect, it } from 'vitest'
import type { CoSpeaker, EmailDoc, Status, Submission, SubmissionData } from '../src/model.js'
import { buildCards } from '../src/shared/cards.js'
import { decision, eligibility, fillInValues, needsFollowUp, speakerGroups, type SpeakerGroup } from '../src/email/recipients.js'
import { fakeSubmission } from '../src/testing/fakeSubmission.js'

const ts = { toMillis: () => 0 }

function sub(over: Partial<Submission> & { id: string }): Submission {
  const email = over.email ?? 'ada@example.com'
  return { ...fakeSubmission({ speakerKey: email.toLowerCase(), email }), removedFromSheet: false, syncedAt: ts, ...over }
}

function co(firstName: string, email: string): CoSpeaker {
  return { firstName, lastName: 'Fakeson', bio: '', email, phone: '', linkedin: '', x: '', instagram: '', photoUrl: '' }
}

function group(subs: Submission[]): SpeakerGroup {
  const groups = speakerGroups(buildCards(subs, () => false))
  expect(groups).toHaveLength(1)
  return groups[0]
}

// Every speaker in these tests; only Ada is a main speaker unless a test says otherwise.
const keys: ReadonlySet<string> = new Set(['ada@example.com'])

const statusOf = (m: Record<string, Status>) => (id: string): Status => m[id] ?? 'pending'

function sent(over: Partial<EmailDoc>): EmailDoc {
  return {
    batchId: 'b1', speakerKey: 'ada@example.com', to: 'ada@example.com', cc: [], templateId: 't-other', templateName: 'Other',
    rule: 'anyone', isDecision: false, talkIds: [], subject: 's', text: 't', attachments: [], sendAt: ts, state: 'sent',
    reason: null, manual: false, replyToThreadId: null, gmailMessageId: 'g', threadId: 'th', rfcMessageId: null,
    claimedAt: ts, sentAt: ts, bounce: null, replyCount: 0, lastReplyAt: null, by: 'u', byName: 'Admin', createdAt: ts,
    ...over,
  }
}
const acceptanceSent = (talkIds: string[], over: Partial<EmailDoc> = {}) =>
  sent({ templateId: 't-acc', templateName: 'Acceptance', rule: 'acceptance', isDecision: true, talkIds, ...over })
const declineSent = (talkIds: string[]) =>
  sent({ templateId: 't-dec', templateName: 'Decline', rule: 'decline', isDecision: true, talkIds })

// Three talks by Ada, submitted A then B then C.
const threeTalks = () => group([
  sub({ id: 'A', title: 'Talk Alpha', timestamp: '10/01/2026 10:00:00', row: 2 }),
  sub({ id: 'B', title: 'Talk Beta', timestamp: '10/02/2026 10:00:00', row: 3 }),
  sub({ id: 'C', title: 'Talk Gamma', timestamp: '10/03/2026 10:00:00', row: 4 }),
])

describe('decision and eligibility', () => {
  it('acceptanceListsOnlyApproved', () => {
    const g = threeTalks()
    const status = statusOf({ A: 'approved', B: 'declined', C: 'pending' })
    expect(decision(g, status)).toBe('approved')
    expect(eligibility('acceptance', g, status, [], { speakerKeys: keys })).toEqual({ ok: true, talkIds: ['A'], cc: [], flags: [] })
    expect(eligibility('decline', g, status, [], { speakerKeys: keys }).ok).toBe(false)
  })

  it('pendingIsNotReady', () => {
    const g = threeTalks()
    for (const s of ['pending', 'maybe'] as const) {
      const status = statusOf({ A: 'declined', B: s, C: 'declined' })
      expect(decision(g, status)).toBe('not-ready')
      expect(eligibility('acceptance', g, status, [], { speakerKeys: keys }).ok).toBe(false)
      expect(eligibility('decline', g, status, [], { speakerKeys: keys }).ok).toBe(false)
      expect(eligibility('approved', g, status, [], { speakerKeys: keys }).ok).toBe(false)
      expect(eligibility('anyone', g, status, [], { speakerKeys: keys })).toMatchObject({ ok: true, talkIds: ['A', 'B', 'C'] })
    }
  })

  it('allDeclinedGetsDecline', () => {
    const g = threeTalks()
    const status = statusOf({ A: 'declined', B: 'declined', C: 'declined' })
    expect(decision(g, status)).toBe('declined')
    expect(eligibility('decline', g, status, [], { speakerKeys: keys })).toEqual({ ok: true, talkIds: ['A', 'B', 'C'], cc: [], flags: [] })
    expect(eligibility('acceptance', g, status, [], { speakerKeys: keys }).ok).toBe(false)
  })

  it('batchSkipsAnyPriorDecision', () => {
    const g = threeTalks()
    const status = statusOf({ A: 'approved', B: 'approved', C: 'declined' })
    const blocked = { ok: false, reason: 'Already had a decision email' }
    // A sent decline (now outdated) still blocks a batch acceptance; so does a manual acceptance on another template.
    expect(eligibility('acceptance', g, status, [declineSent(['A', 'B', 'C'])], { speakerKeys: keys, templateId: 't-acc' })).toEqual(blocked)
    expect(eligibility('acceptance', g, status, [acceptanceSent(['A'], { templateId: 't-old', manual: true })], { speakerKeys: keys, templateId: 't-acc' }))
      .toEqual(blocked)
    const allDeclined = statusOf({ A: 'declined', B: 'declined', C: 'declined' })
    expect(eligibility('decline', g, allDeclined, [acceptanceSent(['A'])], { speakerKeys: keys, templateId: 't-dec' })).toEqual(blocked)
    // Emails that never went out don't count.
    const failed = acceptanceSent(['A'], { state: 'failed' })
    expect(eligibility('acceptance', g, status, [failed], { speakerKeys: keys, templateId: 't-acc' })).toMatchObject({ ok: true, talkIds: ['A', 'B'] })
    // A non-decision email doesn't block a decision email.
    expect(eligibility('acceptance', g, status, [sent({ talkIds: ['A'] })], { speakerKeys: keys, templateId: 't-acc' })).toMatchObject({ ok: true })
  })

  it('followUpAfterDecline', () => {
    const g = threeTalks()
    const status = statusOf({ A: 'approved', B: 'declined', C: 'declined' })
    const history = [declineSent(['A', 'B', 'C'])]
    // A decline does not cover a talk that is later approved (Ruling 1).
    expect(needsFollowUp(g, status, history)).toEqual(['A'])
    expect(eligibility('acceptance', g, status, history, { speakerKeys: keys, followUp: true, templateId: 't-acc' }))
      .toEqual({ ok: true, talkIds: ['A'], cc: [], flags: [] })
    // No decision email yet: nothing to follow up, the speaker belongs in a batch.
    expect(needsFollowUp(g, status, [])).toEqual([])
    expect(needsFollowUp(g, status, [sent({ talkIds: ['A'] })])).toEqual([])
  })

  it('followUpSecondApprovedTalk', () => {
    const g = threeTalks()
    const status = statusOf({ A: 'approved', B: 'pending', C: 'approved' })
    const history = [acceptanceSent(['A'], { manual: true })]
    expect(needsFollowUp(g, status, history)).toEqual(['C'])
    expect(eligibility('acceptance', g, status, history, { speakerKeys: keys, followUp: true, templateId: 't-acc' }))
      .toMatchObject({ ok: true, talkIds: ['C'] })
    // Every approved talk covered: nothing to follow up, and a follow-up is refused.
    const covered = [...history, acceptanceSent(['C'])]
    expect(needsFollowUp(g, status, covered)).toEqual([])
    expect(eligibility('acceptance', g, status, covered, { speakerKeys: keys, followUp: true, templateId: 't-acc' }).ok).toBe(false)
    // followUp with the decline rule is refused once any decision email went out.
    const allDeclined = statusOf({ A: 'declined', B: 'declined', C: 'declined' })
    expect(eligibility('decline', g, allDeclined, history, { speakerKeys: keys, followUp: true, templateId: 't-dec' }))
      .toEqual({ ok: false, reason: 'Already had a decision email' })
    // followUp on acceptance with no prior decision email behaves as a normal acceptance.
    expect(eligibility('acceptance', g, status, [], { speakerKeys: keys, followUp: true, templateId: 't-acc' }))
      .toEqual(eligibility('acceptance', g, status, [], { speakerKeys: keys, templateId: 't-acc' }))
    expect(eligibility('acceptance', g, status, [], { speakerKeys: keys, followUp: true, templateId: 't-acc' }))
      .toEqual({ ok: true, talkIds: ['A', 'C'], cc: [], flags: [] })
    // An unsent acceptance covers nothing.
    expect(needsFollowUp(g, status, [...history, acceptanceSent(['C'], { state: 'unknown' })])).toEqual(['C'])
  })

  it('approvedRuleRejectsDeclined', () => {
    const g = threeTalks()
    const allDeclined = statusOf({ A: 'declined', B: 'declined', C: 'declined' })
    expect(eligibility('approved', g, allDeclined, [], { speakerKeys: keys, templateId: 't-info' }).ok).toBe(false)
    const status = statusOf({ A: 'declined', B: 'approved', C: 'maybe' })
    expect(eligibility('approved', g, status, [], { speakerKeys: keys, templateId: 't-info' })).toEqual({ ok: true, talkIds: ['B'], cc: [], flags: [] })
  })

  it('sameTemplateNotTwice', () => {
    const g = threeTalks()
    const status = statusOf({ A: 'approved' })
    const history = [sent({ templateId: 't-info', rule: 'approved', talkIds: ['A'] })]
    expect(eligibility('approved', g, status, history, { speakerKeys: keys, templateId: 't-info' })).toEqual({ ok: false, reason: 'Already sent this template' })
    expect(eligibility('anyone', g, status, history, { speakerKeys: keys, templateId: 't-info' })).toEqual({ ok: false, reason: 'Already sent this template' })
    // A manual "already emailed" entry counts too.
    expect(eligibility('anyone', g, status, [sent({ templateId: 't-info', manual: true })], { speakerKeys: keys, templateId: 't-info' }).ok).toBe(false)
    // Explicit per-speaker resend, another template, or an unsent email: allowed.
    expect(eligibility('approved', g, status, history, { speakerKeys: keys, templateId: 't-info', followUp: true })).toMatchObject({ ok: true })
    expect(eligibility('approved', g, status, history, { speakerKeys: keys, templateId: 't-other2' })).toMatchObject({ ok: true })
    expect(eligibility('approved', g, status, [sent({ templateId: 't-info', state: 'cancelled' })], { speakerKeys: keys, templateId: 't-info' }))
      .toMatchObject({ ok: true })
    // No template (a one-off email) never matches.
    expect(eligibility('anyone', g, status, [sent({ templateId: null })], { speakerKeys: keys, templateId: null })).toMatchObject({ ok: true })
  })

  it('ccExcludesSelfAndDupes', () => {
    const g = group([
      sub({ id: 'A', title: 'Talk Alpha', row: 2, coSpeaker: co('Bea', 'Bea@Example.com') }),
      sub({ id: 'B', title: 'Talk Beta', row: 3, coSpeaker: co('Bea', ' bea@example.com ') }),
      sub({ id: 'C', title: 'Talk Gamma', row: 4, coSpeaker: co('Self', 'ADA@example.com') }),
      sub({ id: 'D', title: 'Talk Delta', row: 5, coSpeaker: co('', '') }),
      sub({ id: 'E', title: 'Talk Epsilon', row: 6, coSpeaker: co('Cem', 'cem@example.com') }),
    ])
    const status = statusOf({ A: 'approved', B: 'approved', C: 'approved', D: 'approved', E: 'declined' })
    // E is not covered by the acceptance, so its co-speaker is not copied.
    expect(eligibility('acceptance', g, status, [], { speakerKeys: keys })).toMatchObject({ ok: true, talkIds: ['A', 'B', 'C', 'D'], cc: ['bea@example.com'] })
    expect(eligibility('anyone', g, status, [], { speakerKeys: keys })).toMatchObject({ cc: ['bea@example.com', 'cem@example.com'] })
  })

  it('flagsCoSpeakerEdgeCases', () => {
    const g = group([
      sub({ id: 'A', title: 'Talk Alpha', row: 2, coSpeaker: co('Ana', 'ana@example.com') }),
      sub({ id: 'B', title: 'Talk Beta', row: 3, coSpeaker: co('Cem', 'cem@example.com') }),
    ])
    const status = statusOf({ A: 'approved', B: 'declined' })
    const speakerKeys = new Set(['ada@example.com', 'ana@example.com', 'cem@example.com'])
    expect(eligibility('acceptance', g, status, [], { speakerKeys })).toMatchObject({
      ok: true, talkIds: ['A'], cc: ['ana@example.com'],
      flags: ['Co-speaker Ana is also a speaker', 'Co-speaker on a declined talk is not notified'],
    })
    // A co-speaker who isn't a main speaker anywhere raises only the declined-talk flag.
    expect(eligibility('acceptance', g, status, [], { speakerKeys: keys })).toMatchObject({ flags: ['Co-speaker on a declined talk is not notified'] })
    // A declined talk without a co-speaker raises nothing.
    const solo = threeTalks()
    expect(eligibility('acceptance', solo, statusOf({ A: 'approved', B: 'declined' }), [], { speakerKeys: keys })).toMatchObject({ flags: [] })
  })

  it('removedAndNoSessionIgnored', () => {
    const subs = [
      sub({ id: 'A', title: 'Talk Alpha', row: 2, timestamp: '10/01/2026 10:00:00', firstName: 'Old' }),
      sub({ id: 'R', title: 'Removed Talk', row: 3, timestamp: '10/05/2026 10:00:00', removedFromSheet: true, firstName: 'Gone',
        coSpeaker: co('Rae', 'rae@example.com') }),
      sub({ id: 'N', title: '', noSession: true, row: 4, timestamp: '10/06/2026 10:00:00', firstName: 'Nosession' }),
      sub({ id: 'B', title: 'Talk Beta', row: 5, timestamp: '10/02/2026 10:00:00', firstName: 'Ada', email: 'ADA@example.com' }),
      // A speaker with only removed or no-session cards is left out entirely.
      sub({ id: 'X', title: 'Gone Talk', row: 6, email: 'gone@example.com', removedFromSheet: true }),
      sub({ id: 'Y', title: '', noSession: true, row: 7, email: 'gone@example.com' }),
    ]
    const groups = speakerGroups(buildCards(subs, () => false))
    expect(groups.map((g) => g.speakerKey)).toEqual(['ada@example.com'])
    const g = groups[0]
    expect(g.cards.map((c) => c.id)).toEqual(['A', 'B'])
    expect(g.name).toEqual({ first: 'Ada', last: 'Lovelace' })
    expect(g.email).toBe('ADA@example.com')
    // The removed talk's decline and the pending no-session row don't hold up readiness.
    const status = statusOf({ A: 'approved', B: 'approved', R: 'declined' })
    expect(decision(g, status)).toBe('approved')
    expect(eligibility('acceptance', g, status, [], { speakerKeys: keys })).toEqual({ ok: true, talkIds: ['A', 'B'], cc: [], flags: [] })
  })

  it('fillInValuesFormat', () => {
    const g = group([
      sub({ id: 'C', title: 'Talk Gamma', row: 2, timestamp: '10/03/2026 10:00:00', coSpeaker: co('Cem', 'cem@example.com') }),
      sub({ id: 'A', title: 'Talk Alpha', row: 3, timestamp: '10/01/2026 10:00:00', coSpeaker: co('Bea', 'bea@example.com') }),
      sub({ id: 'B', title: 'Talk Beta', row: 4, timestamp: '10/02/2026 10:00:00', coSpeaker: co('Bea', 'bea@example.com') }),
      sub({ id: 'D', title: 'Talk Delta', row: 5, timestamp: '10/04/2026 10:00:00', coSpeaker: co('Dan', 'dan@example.com') }),
    ])
    const values = fillInValues(g, ['C', 'B', 'A'], [{ key: 'venue', label: 'Venue', value: 'Hall 1' }])
    expect(values).toEqual({
      firstName: 'Ada', lastName: 'Lovelace', fullName: 'Ada Lovelace',
      talkTitles: '• Talk Alpha\n• Talk Beta\n• Talk Gamma', talkCount: '3',
      coSpeakerNames: 'Bea Fakeson, Cem Fakeson', venue: 'Hall 1',
    })
    expect(fillInValues(g, [], []).coSpeakerNames).toBe('')
  })
})

describe('eligibility without an email address', () => {
  it('refuses a speaker with no email address, under every rule', () => {
    const g = group([sub({ id: 'n1', email: '  ', speakerKey: 'no-email:row-7' })])
    for (const rule of ['acceptance', 'decline', 'approved', 'anyone'] as const) {
      expect(eligibility(rule, g, statusOf({ n1: 'approved' }), [], { speakerKeys: keys })).toEqual({ ok: false, reason: 'No email address' })
    }
  })
})
