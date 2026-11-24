import { useMemo } from 'react'
import { eligibility, speakerGroups, type SpeakerGroup } from '../../../functions/src/email/recipients.ts'
import type { EmailDoc, RecipientRule, Status } from '../../../functions/src/model.ts'
import { emailsBySpeaker } from '../lib/emails.ts'
import { statusOf } from '../lib/status.ts'
import { useData } from './DataProvider.tsx'

export interface Speakers {
  groups: SpeakerGroup[]
  byKey: Map<string, SpeakerGroup>
  history: Map<string, EmailDoc[]>
  status: (id: string) => Status
  /** The talk page to link a speaker to: their first active talk, else any talk of theirs. */
  talkOf: (speakerKey: string) => string | null
  eligible: (rule: RecipientRule, g: SpeakerGroup, templateId: string | null) => ReturnType<typeof eligibility>
}

// Speakers as the email rules see them (grouped by speakerKey), with their email history and review status.
export function useSpeakers(): Speakers {
  const { cards, reviews, emails } = useData()
  return useMemo(() => {
    const groups = speakerGroups(cards)
    const byKey = new Map(groups.map((g) => [g.speakerKey, g]))
    const speakerKeys = new Set(groups.map((g) => g.speakerKey))
    const history = emailsBySpeaker<EmailDoc>(emails)
    const status = (id: string) => statusOf(reviews, id)
    const talkOf = (key: string) => byKey.get(key)?.cards[0]?.id ?? cards.find((c) => c.speakerKey === key)?.id ?? null
    const eligible = (rule: RecipientRule, g: SpeakerGroup, templateId: string | null) =>
      eligibility(rule, g, status, history.get(g.speakerKey) ?? [], { speakerKeys, templateId })
    return { groups, byKey, history, status, talkOf, eligible }
  }, [cards, reviews, emails])
}
