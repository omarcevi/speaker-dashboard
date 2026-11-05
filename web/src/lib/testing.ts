import type { Review, Score, Status, Submission } from '../../../functions/src/model.ts'

export function fakeSub(over: Partial<Submission> & { id: string; row: number }): Submission {
  return {
    timestamp: '', speakerKey: over.id, firstName: 'Ada', lastName: 'Lovelace', email: `${over.id}@example.com`,
    company: 'Acme', jobTitle: '', phone: '', bio: '', gde: '',
    links: { linkedin: '', x: '', instagram: '', github: '' },
    photoUrl: '', photoFileId: null, speakingExperience: '', whyDevFest: '', anythingElse: '',
    topic: '', topicGroup: 'Web', title: `Talk ${over.id}`, abstract: '', takeaways: '', level: 'Beginner', language: 'English',
    presentedBefore: '', talkHistory: '', noSession: false, coSpeaker: null,
    logistics: {
      fromAbroad: '', abroadFrom: '', transport: '', accommodation: '', tour: '',
      outsideIstanbul: '', city: '', otherRequirements: '', tshirt: '', afterParty: '',
    },
    consent: { codeOfConduct: '', recording: '', personalData: '' }, contentHash: '',
    removedFromSheet: false, syncedAt: { toMillis: () => 0 },
    ...over,
  }
}

export function fakeReview(status: Status): Review {
  return { status, updatedAt: { toMillis: () => 0 }, updatedBy: 'u', updatedByName: 'U' }
}

export function fakeScore(submissionId: string, uid: string, name: string, value: number): Score {
  return { submissionId, uid, name, value, updatedAt: { toMillis: () => 0 } }
}
