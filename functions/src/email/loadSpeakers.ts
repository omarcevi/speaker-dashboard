// Loads everything the send queue needs to judge recipients: speaker groups built from the same cards the team sees,
// review statuses, each speaker's email history and the event fields. Server-only.
import type { Firestore } from 'firebase-admin/firestore'
import type { EmailDoc, EventField, EventSettings, Review, Status, Submission } from '../model.js'
import { buildCards } from '../shared/cards.js'
import { speakerGroups, type SpeakerGroup } from './recipients.js'

export interface LoadedSpeakers {
  groups: SpeakerGroup[]
  status: (id: string) => Status
  historyOf: (speakerKey: string) => EmailDoc[]
  event: EventField[]
  signatureHtml: string
}

export async function loadSpeakers(db: Firestore): Promise<LoadedSpeakers> {
  const [subs, reviews, scores, comments, emails, event] = await Promise.all([
    db.collection('submissions').get(),
    db.collection('reviews').get(),
    db.collection('scores').get(),
    db.collection('comments').get(),
    db.collection('emails').get(),
    db.doc('meta/event').get(),
  ])
  const statuses = new Map(reviews.docs.map((d) => [d.id, (d.data() as Review).status]))
  // The web's rule: a card keeps its review data when a review, score or comment exists for the document.
  const reviewed = new Set<string>(reviews.docs.map((d) => d.id))
  for (const d of [...scores.docs, ...comments.docs]) {
    const id = d.get('submissionId')
    if (typeof id === 'string') reviewed.add(id)
  }
  const submissions = subs.docs.map((d) => ({ ...(d.data() as Submission), id: d.id }))
  const groups = speakerGroups(buildCards(submissions, (id) => reviewed.has(id)))

  const history = new Map<string, EmailDoc[]>()
  for (const d of emails.docs) {
    const e = d.data() as EmailDoc
    const list = history.get(e.speakerKey)
    if (list) list.push(e)
    else history.set(e.speakerKey, [e])
  }
  return {
    groups,
    status: (id) => statuses.get(id) ?? 'pending',
    historyOf: (key) => history.get(key) ?? [],
    event: event.exists ? (event.data() as EventSettings).fields ?? [] : [],
    signatureHtml: event.exists ? (event.data() as EventSettings).signatureHtml ?? '' : '',
  }
}
