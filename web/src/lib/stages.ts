import { decision, type SpeakerGroup } from '../../../functions/src/email/recipients.ts'
import type { EmailDoc, SpeakerStages, Stage, Status, ThreadDoc } from '../../../functions/src/model.ts'
import { shortDate, speakerWroteLast, toIstanbulMs } from './emails.ts'
import { istanbulDate } from './send.ts'

export type CellKind = 'notFor' | 'skipped' | 'bounced' | 'problem' | 'answer' | 'replied' | 'manual' | 'sent'
  | 'scheduled' | 'sending' | 'missing' | 'due' | 'blank'

/** `at` is the email's sent or scheduled time for sent, manual, replied, answer and scheduled; for `due` it is the
 *  due date at Istanbul midnight (so the label can show it); null for every other kind. */
export interface Cell<E extends EmailDoc = EmailDoc> { kind: CellKind; at: number | null; email: E | null }
export type Exceptions = Pick<SpeakerStages, 'skipped' | 'added'>

export const FOLLOW_KINDS: ReadonlySet<CellKind> = new Set<CellKind>(['bounced', 'problem', 'answer'])
export const SENT_KINDS: ReadonlySet<CellKind> = new Set<CellKind>(['sent', 'manual', 'replied', 'answer'])

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const isoDay = /^\d{4}-\d{2}-\d{2}$/
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Stages from the `meta/stages` document data. Rules don't check element shapes, so every field is checked here. */
export function readStages(raw: unknown): Stage[] {
  const stages = isRecord(raw) && Array.isArray(raw.stages) ? raw.stages : []
  const out: Stage[] = []
  for (const s of stages) {
    if (!isRecord(s) || typeof s.id !== 'string' || s.id === '' || typeof s.name !== 'string') continue
    out.push({
      id: s.id,
      name: s.name,
      templateIds: list(s.templateIds),
      dueFrom: typeof s.dueFrom === 'string' && isoDay.test(s.dueFrom) ? s.dueFrom : null,
      appliesTo: s.appliesTo === 'added' ? 'added' : 'everyone',
    })
  }
  return out
}

/** A speaker's skipped / added stage ids from their `speakerStages` document data. */
export function readExceptions(raw: unknown): Exceptions {
  const r = isRecord(raw) ? raw : {}
  return { skipped: list(r.skipped), added: list(r.added) }
}

/** `ids` with `id` added once (`on`) or removed everywhere (`!on`). */
export function toggled(ids: string[], id: string, on: boolean): string[] {
  if (on) return ids.includes(id) ? ids : [...ids, id]
  return ids.filter((x) => x !== id)
}

const validStage = (s: Stage): boolean => !!s && typeof s.id === 'string' && s.id !== ''
const ms = (t: { toMillis(): number } | null | undefined): number | null => (typeof t?.toMillis === 'function' ? t.toMillis() : null)
const timeOf = (e: EmailDoc): number => ms(e.sentAt) ?? ms(e.sendAt) ?? 0
const delivered = (e: EmailDoc) => e.state === 'sent' && !e.bounce
const latest = <E extends EmailDoc>(es: E[]): E => es.reduce((a, b) => (timeOf(b) >= timeOf(a) ? b : a))
const dueMs = (iso: string) => toIstanbulMs(iso, '00:00')

export const dueLabel = (iso: string): string => shortDate(dueMs(iso))

export function stageCell<E extends EmailDoc>(i: {
  stage: Stage; speakerKey: string; exceptions: Exceptions | undefined; emails: E[]
  threads: ReadonlyMap<string, ThreadDoc>; today: string
}): Cell<E> {
  const { stage, speakerKey, exceptions, threads, today } = i
  if (list(exceptions?.skipped).includes(stage.id)) return { kind: 'skipped', at: null, email: null }
  if (stage.appliesTo === 'added' && !list(exceptions?.added).includes(stage.id)) return { kind: 'notFor', at: null, email: null }

  const templateIds = list(stage.templateIds)
  const candidates = i.emails.filter((e) => {
    if (typeof e.templateId !== 'string' || !templateIds.includes(e.templateId) || e.state === 'cancelled') return false
    if (e.speakerKey === speakerKey) return true
    return delivered(e) && list(e.cc).some((c) => c.toLowerCase() === speakerKey)
  })
  if (candidates.length > 0) {
    // A reply that needs an answer stays on the cell until answered, whichever email it was on. Only the speaker's
    // own emails count: a CC'd email's thread belongs to the main recipient. Manual entries have no thread.
    const wroteLast = (e: E) => e.speakerKey === speakerKey && delivered(e) && !e.manual && !!e.threadId && speakerWroteLast(threads.get(e.threadId))
    const unanswered = candidates.filter(wroteLast)
    if (unanswered.length > 0) {
      const e = latest(unanswered)
      return { kind: 'answer', at: timeOf(e), email: e }
    }
    const sent = candidates.filter(delivered)
    const e = latest(sent.length > 0 ? sent : candidates)
    const at = timeOf(e)
    if (e.bounce) return { kind: 'bounced', at: null, email: e }
    switch (e.state) {
      case 'failed': case 'unknown': case 'held': return { kind: 'problem', at: null, email: e }
      case 'sent': {
        const thread = e.speakerKey === speakerKey && !e.manual && e.threadId ? threads.get(e.threadId) : undefined
        if (thread?.lastReplyAt) return { kind: 'replied', at, email: e }
        return { kind: e.manual ? 'manual' : 'sent', at, email: e }
      }
      case 'scheduled': return { kind: 'scheduled', at: ms(e.sendAt), email: e }
      default: return { kind: 'sending', at: null, email: e }
    }
  }
  if (typeof stage.dueFrom !== 'string' || stage.dueFrom === '') return { kind: 'blank', at: null, email: null }
  if (today >= stage.dueFrom) return { kind: 'missing', at: null, email: null }
  return { kind: 'due', at: dueMs(stage.dueFrom), email: null }
}

export interface StageRow<E extends EmailDoc = EmailDoc> { g: SpeakerGroup; noApproved: boolean; cells: Record<string, Cell<E>> }

export function stageRows<E extends EmailDoc>(i: {
  stages: Stage[]; groups: SpeakerGroup[]; status: (talkId: string) => Status; emails: E[]
  threads: ReadonlyMap<string, ThreadDoc>; exceptions: ReadonlyMap<string, Exceptions>; now: number
}): StageRow<E>[] {
  const today = istanbulDate(i.now)
  const stages = i.stages.filter(validStage)
  // Each speaker's own emails, and the ones they are CC'd on.
  const byKey = new Map<string, E[]>()
  const add = (k: string, e: E) => { const l = byKey.get(k); if (l) { if (!l.includes(e)) l.push(e) } else byKey.set(k, [e]) }
  for (const e of i.emails) {
    add(e.speakerKey, e)
    for (const c of list(e.cc)) add(c.toLowerCase(), e)
  }
  const rows: StageRow<E>[] = []
  for (const g of i.groups) {
    const emails = byKey.get(g.speakerKey) ?? []
    const approved = decision(g, i.status) === 'approved'
    const acceptedSent = emails.some((e) => e.speakerKey === g.speakerKey && e.rule === 'acceptance' && e.state === 'sent')
    if (!approved && !acceptedSent) continue
    const cells: Record<string, Cell<E>> = {}
    for (const stage of stages) {
      cells[stage.id] = stageCell({ stage, speakerKey: g.speakerKey, exceptions: i.exceptions.get(g.speakerKey), emails, threads: i.threads, today })
    }
    rows.push({ g, noApproved: !approved, cells })
  }
  return rows
}

const anyCell = (r: StageRow, kinds: ReadonlySet<CellKind>) => Object.values(r.cells).some((c) => kinds.has(c.kind))
const MISSING: ReadonlySet<CellKind> = new Set<CellKind>(['missing'])
export const rowMissing = (r: StageRow): boolean => anyCell(r, MISSING)
export const rowFollow = (r: StageRow): boolean => anyCell(r, FOLLOW_KINDS)

const nameOf = (r: StageRow) => `${r.g.name.first} ${r.g.name.last}`
/** Follow-up rows first, then rows that are only missing something, then the rest; ties by name. */
export function sortRows<R extends StageRow>(rows: R[]): R[] {
  const rank = (r: R) => (rowFollow(r) ? 0 : rowMissing(r) ? 1 : 2)
  return [...rows].sort((a, b) => rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b)))
}

export function stageCounts(rows: StageRow[], stageId: string): { sent: number; missing: number; follow: number } {
  const n = { sent: 0, missing: 0, follow: 0 }
  for (const r of rows) {
    const k = r.cells[stageId]?.kind
    if (!k) continue
    if (SENT_KINDS.has(k)) n.sent++
    if (k === 'missing') n.missing++
    if (FOLLOW_KINDS.has(k)) n.follow++
  }
  return n
}

export function stageSummary(stage: Stage, c: { sent: number; missing: number }, today: string): string {
  const parts: string[] = []
  if (c.sent > 0) parts.push(`${c.sent} sent`)
  if (c.missing > 0) parts.push(`${c.missing} missing`)
  const future = typeof stage.dueFrom === 'string' && stage.dueFrom !== '' && today < stage.dueFrom
  if (c.missing === 0 && future) parts.push(`due ${dueLabel(stage.dueFrom!)}`)
  if (parts.length > 0) return parts.join(' · ')
  return stage.dueFrom ? '0 sent' : 'no due date'
}

export function cellLabel(c: Cell): string {
  const date = c.at === null ? '' : shortDate(c.at)
  switch (c.kind) {
    case 'skipped': return 'Skipped'
    case 'bounced': return 'Bounced'
    case 'problem': return 'Problem'
    case 'answer': return 'Replied – needs an answer'
    case 'replied': return 'Replied'
    case 'manual': return `Marked sent ${date}`
    case 'sent': return `Sent ${date}`
    case 'scheduled': return `Scheduled ${date}`
    case 'sending': return 'Sending'
    case 'missing': return 'Missing'
    case 'due': return `Due ${date}`
    default: return ''
  }
}

export function cellTone(c: Cell): '' | 'strong' | 'warn' | 'line' | 'faint' {
  switch (c.kind) {
    case 'bounced': case 'problem': case 'answer': case 'missing': return 'warn'
    case 'replied': return 'strong'
    case 'scheduled': case 'sending': return 'line'
    case 'due': case 'skipped': case 'notFor': return 'faint'
    default: return ''
  }
}

export const MAX_STAGES = 30 // the rules' cap

/** `s` sending `templateId`; the templates it used before stay listed so past sends still count. */
export const withTemplate = (s: Stage, templateId: string): Stage => ({ ...s, templateIds: [templateId, ...s.templateIds.filter((t) => t !== templateId)] })

export const newStage = (id: string, templateId: string): Stage => ({ id, name: '', templateIds: [templateId], dueFrom: null, appliesTo: 'everyone' })

/** Why `stages` can't be saved, or null. A stage whose current template was deleted may still be saved. */
export function stagesProblem(stages: Stage[]): string | null {
  for (const s of stages) {
    if (s.name.trim() === '') return 'Every stage needs a name'
    if (s.templateIds.length === 0) return `Pick a template for ${s.name}`
  }
  return stages.length > MAX_STAGES ? `At most ${MAX_STAGES} stages` : null
}

/** The send flow for `templateId` with these speakers ticked. */
export function sendLink(templateId: string, speakerKeys: string[]): string {
  const q = new URLSearchParams(speakerKeys.map((k) => ['speaker', k]))
  return `/emails/templates/${encodeURIComponent(templateId)}/send?${q.toString()}`
}

/** What "Mark as already sent" did: the server creates nothing (`created` 0) for a speaker the template refuses. */
export function markNote(created: number, first: string, stageName: string, refusal: string | null): string {
  if (created > 0) return `Marked ${stageName} as already sent for ${first}.`
  return `Not marked: ${refusal ?? `${first} already has this email on its way`}`
}
