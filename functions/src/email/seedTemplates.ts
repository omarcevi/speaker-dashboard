// First-run setup for speaker email: the two decision templates (placeholder text for the team to edit) and empty
// event settings. Never overwrites: templates are created only while the collection is empty, meta/event only while it
// is missing, and each doc with create() so parallel runs create it once. Server-only.
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { EmailTemplate, EventSettings } from '../model.js'
import { toHtml } from './fillIns.js'

const BY = { updatedBy: 'system', updatedByName: 'Setup' }

const TEMPLATES: Record<string, Pick<EmailTemplate, 'name' | 'subject' | 'body' | 'rule'>> = {
  acceptance: {
    name: 'Acceptance',
    rule: 'acceptance',
    subject: 'You are speaking at {{eventName}}',
    body: 'Hi {{firstName}},\n\nGood news: we would love to have you on stage at {{eventName}} with:\n{{talkTitles}}\n\n' +
      'We will send the details soon.\n\nThe {{eventName}} team',
  },
  decline: {
    name: 'Decline',
    rule: 'decline',
    subject: 'Your {{eventName}} submission',
    body: 'Hi {{firstName}},\n\nThank you for submitting to {{eventName}}. We could not fit these talks in this time:\n' +
      '{{talkTitles}}\n\nWe hope to see you at the event.\n\nThe {{eventName}} team',
  },
}

const EVENT_FIELDS: EventSettings['fields'] = [
  { key: 'eventName', label: 'Event name', value: '' },
  { key: 'eventDate', label: 'Event date', value: '' },
  { key: 'venue', label: 'Venue', value: '' },
]

const isAlreadyExists = (e: unknown) => (e as { code?: unknown }).code === 6

async function createOnce(ref: FirebaseFirestore.DocumentReference, data: object): Promise<boolean> {
  try {
    await ref.create(data)
    return true
  } catch (e) {
    if (isAlreadyExists(e)) return false
    throw e
  }
}

/** Seeds the decision templates and event settings when they don't exist yet. Returns how many docs it created. */
export async function seedTemplates(db: Firestore, now: number = Date.now()): Promise<number> {
  const at = Timestamp.fromMillis(now)
  const [templates, event] = await Promise.all([db.collection('templates').limit(1).get(), db.doc('meta/event').get()])
  const writes: Promise<boolean>[] = []
  if (templates.empty) {
    for (const [id, t] of Object.entries(TEMPLATES)) {
      const doc: EmailTemplate = { ...t, html: toHtml(t.body), attachments: [], stageId: null, updatedAt: at, ...BY }
      writes.push(createOnce(db.doc(`templates/${id}`), doc))
    }
  }
  if (!event.exists) {
    const doc: EventSettings = { fields: EVENT_FIELDS, updatedAt: at, ...BY }
    writes.push(createOnce(db.doc('meta/event'), doc))
  }
  const created = (await Promise.all(writes)).filter(Boolean).length
  if (created) console.log(`Email setup: created ${created} docs`)
  return created
}
