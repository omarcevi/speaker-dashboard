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
  for (const talks of bySpeaker.values()) {
    const latest = talks.reduce((a, b) => (b.row > a.row ? b : a))
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

const HEADER = [
  'Type', 'Name', 'Email', 'Phone', 'Talks', 'From abroad', 'Coming from (abroad)', 'Outside Istanbul', 'City',
  'Transport support', 'Accommodation support', 'Istanbul tour', 'After party', 'T-shirt', 'Other requirements', 'Anything else',
]

function field(value: string): string {
  let v = value
  if (/^[=+\-@\t\r]/.test(v) && !/^\+?[\d\s().-]+$/.test(v)) v = `'${v}`
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function toCsv(rows: LogisticsRow[]): string {
  const lines = [HEADER.map(field).join(',')]
  for (const r of rows) {
    lines.push([
      r.kind, r.name, r.email, r.phone, r.talks, r.fromAbroad, r.abroadFrom, r.outsideIstanbul, r.city,
      r.transport, r.accommodation, r.tour, r.afterParty, r.tshirt, r.otherRequirements, r.anythingElse,
    ].map(field).join(','))
  }
  return '﻿' + lines.join('\r\n')
}
