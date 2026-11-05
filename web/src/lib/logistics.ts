import type { Review, Submission } from '../../../functions/src/model.ts'
import { statusOf } from './status.ts'

export interface LogisticsRow {
  kind: 'speaker' | 'co-speaker'
  name: string
  email: string
  phone: string
  talks: string
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

const fullName = (first: string, last: string) => `${first} ${last}`.trim()

export function logisticsRows(subs: Submission[], reviews: Map<string, Review>): LogisticsRow[] {
  const approved = subs.filter((s) => !s.removedFromSheet && statusOf(reviews, s.id) === 'approved')
  const bySpeaker = new Map<string, Submission[]>()
  for (const s of approved) bySpeaker.set(s.speakerKey, [...(bySpeaker.get(s.speakerKey) ?? []), s])

  const rows: LogisticsRow[] = []
  for (let talks of bySpeaker.values()) {
    talks = [...talks].sort((a, b) => a.row - b.row)
    const latest = talks[talks.length - 1]
    rows.push({
      kind: 'speaker',
      name: fullName(latest.firstName, latest.lastName),
      email: latest.email,
      phone: latest.phone,
      talks: talks.map((t) => t.title).join(' | '),
      ...latest.logistics,
      anythingElse: latest.anythingElse,
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
      fromAbroad: '', abroadFrom: '', outsideIstanbul: '', city: '', transport: '',
      accommodation: '', tour: '', afterParty: '', tshirt: '', otherRequirements: '', anythingElse: '',
    })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

const PHONE_COL = 3
const HEADER = [
  'Type', 'Name', 'Email', 'Phone', 'Talks', 'From abroad', 'Coming from (abroad)', 'Outside Istanbul', 'City',
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
      r.kind, r.name, r.email, r.phone, r.talks, r.fromAbroad, r.abroadFrom, r.outsideIstanbul, r.city,
      r.transport, r.accommodation, r.tour, r.afterParty, r.tshirt, r.otherRequirements, r.anythingElse,
    ]
    lines.push(cells.map((c, i) => field(c, i === PHONE_COL)).join(','))
  }
  return '﻿' + lines.join('\r\n')
}
