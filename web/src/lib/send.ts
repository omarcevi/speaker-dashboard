import { fillInLabel, isFillInName } from '../../../functions/src/email/fillIns.ts'
import {
  decision, eligibility, fillInValues, inFlightConflict, needsFollowUp, type Eligibility, type SpeakerGroup,
} from '../../../functions/src/email/recipients.ts'
import type { EmailDoc, EventField, RecipientRule, Status } from '../../../functions/src/model.ts'
import { renderHtmlEmail, templateHtml } from '../../../functions/src/shared/emailHtml.ts'

// Pure parts of the send flow: who can get a template (the tabs on step 1) and what each recipient's email looks like.
// The server re-checks all of it; this is the preview of the same rules.

export type Tab = 'ready' | 'follow' | 'not'

export interface RecipientRow {
  g: SpeakerGroup
  tab: Tab
  /** Why the speaker can't get it (or needs a follow-up); null when ready. */
  reason: string | null
  /** They already got this template (or, for decision templates, a decision email). */
  already: boolean
  decision: 'approved' | 'declined' | 'not-ready'
  /** Co-speaker addresses a ready speaker's email copies. */
  cc: string[]
}

export const isDecisionRule = (r: RecipientRule) => r === 'acceptance' || r === 'decline'
export const ON_ITS_WAY = 'Already on its way'

const ALREADY = new Set(['Already sent this template', 'Already had a decision email'])

export interface Judge {
  status: (id: string) => Status
  historyOf: (speakerKey: string) => EmailDoc[]
  speakerKeys: ReadonlySet<string>
}

/** Every speaker sorted into Ready / Needs a follow-up / Not ready for a template, with the reason. */
export function recipientRows(rule: RecipientRule, templateId: string | null, groups: SpeakerGroup[], j: Judge): RecipientRow[] {
  return groups.map((g) => {
    const history = j.historyOf(g.speakerKey)
    const base = { g, decision: decision(g, j.status), cc: [] as string[] }
    if (inFlightConflict(history, templateId, rule)) return { ...base, tab: 'not', reason: ON_ITS_WAY, already: false }
    const e = eligibility(rule, g, j.status, history, { speakerKeys: j.speakerKeys, templateId })
    if (e.ok) return { ...base, tab: 'ready', reason: null, already: false, cc: e.cc }
    if (rule === 'acceptance' && needsFollowUp(g, j.status, history).length > 0) {
      return { ...base, tab: 'follow', reason: 'Decision changed after their last email', already: true }
    }
    return { ...base, tab: 'not', reason: e.reason, already: ALREADY.has(e.reason) }
  })
}

export type DecisionFilter = 'all' | 'approved' | 'declined' | 'not-ready'
export interface RowFilter { decision: DecisionFilter; hideAlready: boolean }

/** Whether a row shows under the step 1 filters. */
export const passes = (r: RecipientRow, f: RowFilter) =>
  (f.decision === 'all' || r.decision === f.decision) && !(f.hideAlready && r.already)

/**
 * The speakers a batch goes to: ticked Ready rows the filters show. `hidden` counts ticked Ready rows the filters
 * hide, which are left out.
 */
export function visibleSelection(rows: RecipientRow[], unticked: ReadonlySet<string>, f: RowFilter): { selected: string[]; hidden: number } {
  const ticked = rows.filter((r) => r.tab === 'ready' && !unticked.has(r.g.speakerKey))
  const selected = ticked.filter((r) => passes(r, f)).map((r) => r.g.speakerKey)
  return { selected, hidden: ticked.length - selected.length }
}

/** The starting unticked set: with chosen speakers (a speaker's Email menu, or the Stages grid), everyone else; otherwise nobody. */
export function untickedExcept(speakerKeys: string[], only: string[] | null): Set<string> {
  if (!only || only.length === 0) return new Set()
  const keep = new Set(only)
  return new Set(speakerKeys.filter((k) => !keep.has(k)))
}

/** The chosen speakers who can't get the template now (not on the Ready tab), with their reason. */
export function pickedNotReady(rows: RecipientRow[], picked: string[]): RecipientRow[] {
  const want = new Set(picked)
  return rows.filter((r) => want.has(r.g.speakerKey) && r.tab !== 'ready')
}

/** "Ada Lovelace, Grace Hopper" — at most `max` names, then "+N more". */
export function nameList(names: string[], max = 5): string {
  const shown = names.slice(0, max).join(', ')
  return names.length > max ? `${shown} +${names.length - max} more` : shown
}

export interface PreviewHtml {
  /** The body as the speaker gets it, signature included. A blocked fill-in shows as written, like {{venue}}. */
  html: string
  /** Fill-ins that are unknown or empty for this speaker: the email can't send. */
  missing: string[]
  empty: string[]
}

/** The email body for these values, rendered as the server renders it (template HTML, or the body as paragraphs). */
export function previewHtml(source: { subject: string; body: string; html?: string | null }, values: Record<string, string>, signatureHtml: string): PreviewHtml {
  const t = { subject: source.subject, html: templateHtml(source) }
  const r = renderHtmlEmail(t, values, signatureHtml)
  if (r.ok) return { html: r.html, missing: [], empty: [] }
  const shown = Object.fromEntries([...r.missing, ...r.empty].map((n) => [n, fillInLabel(n)]))
  const lenient = renderHtmlEmail(t, { ...values, ...shown }, signatureHtml)
  return { html: lenient.ok ? lenient.html : '', missing: r.missing, empty: r.empty }
}

export interface Prepared {
  g: SpeakerGroup
  /** Why this speaker can't get it any more (status changed since step 1, say); null when they can. */
  refused: string | null
  talkIds: string[]
  cc: string[]
  flags: string[]
  values: Record<string, string>
  /** The body as the preview shows it, signature included. */
  html: string
  /** Fill-ins that are unknown or empty for this speaker: the email can't send. */
  missing: string[]
  empty: string[]
}

/** One recipient's email as the preview shows it. */
export function prepare(
  rule: RecipientRule, source: { subject: string; body: string; html?: string | null }, g: SpeakerGroup, j: Judge, fields: EventField[],
  opts: { templateId: string | null; followUp: boolean; signatureHtml: string },
): Prepared {
  const history = j.historyOf(g.speakerKey)
  const e: Eligibility = inFlightConflict(history, opts.templateId, rule)
    ? { ok: false, reason: ON_ITS_WAY }
    : eligibility(rule, g, j.status, history, { speakerKeys: j.speakerKeys, templateId: opts.templateId, followUp: opts.followUp })
  const talkIds = e.ok ? e.talkIds : g.cards.map((c) => c.id)
  const values = fillInValues(g, talkIds, fields)
  const r = previewHtml(source, values, opts.signatureHtml)
  return {
    g, refused: e.ok ? null : e.reason, talkIds, cc: e.ok ? e.cc : [], flags: e.ok ? e.flags : [], values,
    html: r.html, missing: r.missing, empty: r.empty,
  }
}

export const canSend = (p: Prepared) => p.refused === null && p.missing.length === 0 && p.empty.length === 0

/** Why a prepared email won't send, in words: "{{venue}} is empty", "{{foo}} isn't a known fill-in". */
export function blockedReason(p: Prepared): string {
  if (p.refused !== null) return p.refused
  const parts = [
    ...p.empty.map((n) => `{{${n}}} is empty`),
    ...p.missing.map((n) => (isFillInName(n) ? `{{${n}}} isn't a known fill-in` : `${n} isn't a valid fill-in`)),
  ]
  return parts.join(', ')
}

/** The date ("2026-12-02") in Istanbul (UTC+3, no DST) at `ms`. */
export const istanbulDate = (ms: number) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10)

export const speakerName = (g: SpeakerGroup) => `${g.name.first} ${g.name.last}`.trim() || g.email

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
