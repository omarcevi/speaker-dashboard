import type { AdvocuDetails, Source, Submission } from '../../../functions/src/model.ts'
import { talkKey } from '../../../functions/src/talkKey.ts'
import { submittedAtMs } from './time.ts'

// One reviewable talk: a group of documents (Form and/or Advocu) with the same speaker and title.
// `id` is the primary document's id, so reviews, scores and comments keyed by it keep working.
export type Card = Submission & { sources: Source[]; memberIds: string[]; advocu: AdvocuDetails | null; possibleDuplicateOf: string[] }

const SOURCE_ORDER: Source[] = ['form', 'advocu']
const sourceOf = (s: Submission): Source => s.source ?? 'form'
const byId = (a: Submission, b: Submission) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
// Oldest first. Form docs by sheet row; Advocu docs by submission time (an unknown time counts as oldest).
const byRow = (a: Submission, b: Submission) => a.row - b.row || byId(a, b)
const byTime = (a: Submission, b: Submission) => (submittedAtMs(a) ?? 0) - (submittedAtMs(b) ?? 0) || byId(a, b)
const latestPresent = (sorted: Submission[]) => sorted.filter((s) => !s.removedFromSheet).at(-1)

function single(sub: Submission, possibleDuplicateOf: string[]): Card {
  return { ...sub, sources: [sourceOf(sub)], memberIds: [sub.id], advocu: sub.advocu ?? null, possibleDuplicateOf }
}

function groupCards(members: Submission[], hasReviewData: (id: string) => boolean): Card[] {
  const reviewed = members.filter((m) => hasReviewData(m.id))
  // Two or more reviewed docs: merging would hide a decision, score or comment, so each stays its own card.
  if (reviewed.length >= 2) {
    return members.map((m) => single(m, members.filter((o) => o !== m).map((o) => o.id)))
  }
  const forms = members.filter((m) => sourceOf(m) === 'form').sort(byRow)
  const advocus = members.filter((m) => sourceOf(m) === 'advocu').sort(byTime)
  const primary = reviewed[0] ?? forms.at(-1) ?? advocus[0]
  const display = latestPresent(forms) ?? latestPresent(advocus) ?? primary
  const advocuDoc = sourceOf(primary) === 'advocu' ? primary : advocus.at(-1)
  return [{
    ...display,
    id: primary.id,
    removedFromSheet: members.every((m) => m.removedFromSheet),
    sources: SOURCE_ORDER.filter((src) => members.some((m) => sourceOf(m) === src)),
    memberIds: members.map((m) => m.id),
    advocu: advocuDoc?.advocu ?? null,
    possibleDuplicateOf: [],
  }]
}

// Groups every document, removed or not, by talkKey; a doc with no talkKey (empty title) is a card on its own.
export function buildCards(subs: Submission[], hasReviewData: (id: string) => boolean): Card[] {
  const byKey = new Map<string, Submission[]>()
  const groups: Submission[][] = []
  for (const sub of subs) {
    const key = talkKey(sub.speakerKey, sub.title)
    const group = key === null ? undefined : byKey.get(key)
    if (group) {
      group.push(sub)
    } else {
      const created = [sub]
      groups.push(created)
      if (key !== null) byKey.set(key, created)
    }
  }
  return groups.flatMap((members) => groupCards(members, hasReviewData))
}

// The card for a URL id: the card itself, or the merged card that a hidden member now belongs to.
export function cardFor(cards: Card[], id: string): Card | undefined {
  return cards.find((c) => c.id === id) ?? cards.find((c) => c.memberIds.includes(id))
}
