import type { Review, Submission } from '../../../functions/src/model.ts'
import { cardFor, type Card } from './cards.ts'
import { statusOf } from './status.ts'

export interface LogisticsRow {
  kind: 'speaker' | 'co-speaker'
  name: string
  email: string
  phone: string
  talks: string
  // null for co-speaker rows: co-speakers never fill in logistics
  formAnswers: 'yes' | 'unreviewed' | 'no' | null
  fromAbroad: string
  abroadFrom: string
  outsideIstanbul: string
  city: string
  transport: string
  accommodation: string
  tour: string
  afterParty: string
  tshirt: string
  otherRequirements: string
  anythingElse: string
}

const EMPTY_LOGISTICS = {
  fromAbroad: '', abroadFrom: '', outsideIstanbul: '', city: '', transport: '',
  accommodation: '', tour: '', afterParty: '', tshirt: '', otherRequirements: '',
}

const fullName = (first: string, last: string) => `${first} ${last}`.trim()

export function logisticsRows(cards: Card[], subs: Submission[], reviews: Map<string, Review>): LogisticsRow[] {
  const approved = cards.filter((c) => !c.removedFromSheet && statusOf(reviews, c.id) === 'approved')
  const bySpeaker = new Map<string, Card[]>()
  for (const c of approved) bySpeaker.set(c.speakerKey, [...(bySpeaker.get(c.speakerKey) ?? []), c])

  // Form emails are typed, not verified, so contact details always come from the reviewed doc: the primary of the
  // speaker's latest approved card, even if it was removed since. Logistics come from the speaker's latest present
  // Form doc: an approved one first, else one not declined (flagged unreviewed).
  const subById = new Map(subs.map((s) => [s.id, s]))
  const formDocs = new Map<string, Submission[]>()
  for (const s of subs) {
    if (s.removedFromSheet || (s.source ?? 'form') === 'advocu') continue
    formDocs.set(s.speakerKey, [...(formDocs.get(s.speakerKey) ?? []), s])
  }
  const latestWhere = (docs: Submission[], ok: (s: Submission) => boolean) =>
    docs.filter(ok).sort((a, b) => a.row - b.row).at(-1)
  // 'approved' only for the reviewed doc an approved card displays. A hidden merged member, or a doc shown only because
  // the reviewed one was removed, could be a spoofed response.
  const docState = (doc: Submission): 'approved' | 'declined' | 'other' => {
    const card = cardFor(cards, doc.id)
    const status = statusOf(reviews, card ? card.id : doc.id)
    if (status === 'declined') return 'declined'
    return card && card.displayId === doc.id && card.displayId === card.id && status === 'approved' ? 'approved' : 'other'
  }

  const rows: LogisticsRow[] = []
  for (const [key, group] of bySpeaker) {
    const talks = [...group].sort((a, b) => a.row - b.row)
    const latest = talks[talks.length - 1]
    const who = subById.get(latest.id) ?? latest
    const docs = formDocs.get(key) ?? []
    const approvedDoc = latestWhere(docs, (d) => docState(d) === 'approved')
    const otherDoc = approvedDoc ? undefined : latestWhere(docs, (d) => docState(d) !== 'declined')
    const form = approvedDoc ?? otherDoc
    rows.push({
      kind: 'speaker',
      name: fullName(who.firstName, who.lastName),
      email: who.email,
      phone: who.phone,
      talks: talks.map((t) => t.title).join(' | '),
      formAnswers: approvedDoc ? 'yes' : otherDoc ? 'unreviewed' : 'no',
      ...(form ? form.logistics : EMPTY_LOGISTICS),
      anythingElse: form ? form.anythingElse : '',
    })
  }
  for (const s of approved) {
    if (!s.coSpeaker) continue
    rows.push({
      kind: 'co-speaker',
      name: fullName(s.coSpeaker.firstName, s.coSpeaker.lastName),
      email: s.coSpeaker.email,
      phone: s.coSpeaker.phone,
      talks: s.title,
      formAnswers: null,
      ...EMPTY_LOGISTICS,
      anythingElse: '',
    })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

const FORM_ANSWERS_CSV = { yes: 'Yes', unreviewed: 'Unreviewed', no: 'No', none: '' }
const PHONE_COL = 3
const HEADER = [
  'Type', 'Name', 'Email', 'Phone', 'Talks', 'Form answers', 'From abroad', 'Coming from (abroad)', 'Outside Istanbul', 'City',
  'Transport support', 'Accommodation support', 'Istanbul tour', 'After party', 'T-shirt', 'Other requirements', 'Anything else',
]

function field(value: string, isPhone = false): string {
  let v = value
  const phoneOk = isPhone && /^\+\d[\d\s().-]*$/.test(v)
  if (/^[=+\-@\t\r]/.test(v) && !phoneOk) v = `'${v}`
  // Excel in Turkish locale may split on ';' or tab regardless of quoting
  v = v.replace(/([;\t]\s*)([=+\-@])/g, "$1'$2")
  return `"${v.replace(/"/g, '""')}"`
}

export function toCsv(rows: LogisticsRow[]): string {
  const lines = [HEADER.map((h) => field(h)).join(',')]
  for (const r of rows) {
    const cells = [
      r.kind, r.name, r.email, r.phone, r.talks, FORM_ANSWERS_CSV[r.formAnswers ?? 'none'], r.fromAbroad, r.abroadFrom, r.outsideIstanbul, r.city,
      r.transport, r.accommodation, r.tour, r.afterParty, r.tshirt, r.otherRequirements, r.anythingElse,
    ]
    lines.push(cells.map((c, i) => field(c, i === PHONE_COL)).join(','))
  }
  return '﻿' + lines.join('\r\n')
}
