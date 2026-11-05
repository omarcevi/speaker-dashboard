import type { Submission } from '../../../functions/src/model.ts'

export function otherTalks(subs: Submission[], current: Submission): Submission[] {
  return subs
    .filter((s) => s.speakerKey === current.speakerKey && s.id !== current.id && !s.removedFromSheet)
    .sort((a, b) => a.row - b.row)
}
