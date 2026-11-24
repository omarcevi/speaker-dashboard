import { describe, it, expect, beforeEach } from 'vitest'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { EmailTemplate, EventSettings } from '../src/model.js'
import { seedTemplates } from '../src/email/seedTemplates.js'
import { fillInsIn, SPEAKER_FILL_INS } from '../src/email/fillIns.js'

const db = getFirestore(initializeApp({ projectId: 'demo-cfp' }))
const T0 = Date.UTC(2026, 10, 24, 9, 0, 0)

const templates = async () =>
  Object.fromEntries((await db.collection('templates').get()).docs.map(d => [d.id, d.data() as EmailTemplate]))

describe('seedTemplates', () => {
  beforeEach(async () => {
    await Promise.all(['templates', 'meta'].map(c => db.recursiveDelete(db.collection(c))))
  })

  it('seedTemplates only when empty', async () => {
    await seedTemplates(db, T0)
    const t = await templates()
    expect(Object.keys(t).sort()).toEqual(['acceptance', 'decline'])
    expect(t.acceptance).toMatchObject({ name: 'Acceptance', rule: 'acceptance', attachments: [], stageId: null })
    expect(t.decline).toMatchObject({ name: 'Decline', rule: 'decline', attachments: [], stageId: null })
    for (const x of Object.values(t)) {
      const text = `${x.subject}\n${x.body}`
      for (const key of ['firstName', 'talkTitles', 'eventName']) expect(text).toContain(`{{${key}}}`)
      expect(x.updatedAt.toMillis()).toBe(T0)
    }
    const event = (await db.doc('meta/event').get()).data() as EventSettings
    expect(event.fields).toEqual([
      { key: 'eventName', label: 'Event name', value: '' },
      { key: 'eventDate', label: 'Event date', value: '' },
      { key: 'venue', label: 'Venue', value: '' },
    ])
    // Every fill-in in the seeded text is known once the event fields exist.
    for (const x of Object.values(t)) {
      const known = new Set<string>([...SPEAKER_FILL_INS, ...event.fields.map(f => f.key)])
      expect(fillInsIn(`${x.subject}\n${x.body}`).filter(k => !known.has(k))).toEqual([])
    }

    // Edits and deletions by the team are never undone.
    await db.doc('templates/acceptance').update({ body: 'Edited' })
    await db.doc('templates/decline').delete()
    await db.doc('meta/event').update({ fields: [{ key: 'venue', label: 'Venue', value: 'Hall A' }] })
    await seedTemplates(db, T0 + 1000)
    const after = await templates()
    expect(Object.keys(after)).toEqual(['acceptance'])
    expect(after.acceptance.body).toBe('Edited')
    expect(((await db.doc('meta/event').get()).data() as EventSettings).fields).toEqual([{ key: 'venue', label: 'Venue', value: 'Hall A' }])
  })

  it('leaves existing templates alone and still creates missing event settings', async () => {
    await db.doc('templates/custom').set({ name: 'Mine', subject: 's', body: 'b', attachments: [], rule: 'anyone', stageId: null,
      updatedAt: Timestamp.fromMillis(T0), updatedBy: 'u', updatedByName: 'U' })
    await seedTemplates(db, T0)
    expect(Object.keys(await templates())).toEqual(['custom'])
    expect((await db.doc('meta/event').get()).exists).toBe(true)
  })

  it('parallel calls create each doc once', async () => {
    await Promise.all([seedTemplates(db, T0), seedTemplates(db, T0)])
    expect(Object.keys(await templates()).sort()).toEqual(['acceptance', 'decline'])
  })
})
