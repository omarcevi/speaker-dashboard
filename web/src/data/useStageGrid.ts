import { useMemo } from 'react'
import type { EmailDoc, EmailTemplate, Stage } from '../../../functions/src/model.ts'
import { istanbulDate } from '../lib/send.ts'
import { stageRows, type StageRow } from '../lib/stages.ts'
import { useData } from './DataProvider.tsx'
import { useNow } from './useNow.ts'
import { useSpeakers } from './useSpeakers.ts'

export interface StageGrid {
  stages: Stage[]
  rows: StageRow<EmailDoc & { id: string }>[]
  /** The Istanbul date, `YYYY-MM-DD`. */
  today: string
  /** The template a stage sends (its first id); null when that template no longer exists. */
  templateOf: (s: Stage) => (EmailTemplate & { id: string }) | null
  loading: boolean
}

export function useStageGrid(): StageGrid {
  const { stages, speakerStages, emails, threads, templates, loading } = useData()
  const { groups, status } = useSpeakers()
  const now = useNow()
  const today = istanbulDate(now)
  return useMemo(() => {
    const threadMap = new Map(threads.map((t) => [t.id, t]))
    const rows = stageRows({ stages, groups, status, emails, threads: threadMap, exceptions: speakerStages, now })
    const templateOf = (s: Stage) => templates.find((t) => t.id === s.templateIds[0]) ?? null
    return { stages, rows, today, templateOf, loading }
  }, [stages, speakerStages, emails, threads, templates, groups, status, now, today, loading])
}
