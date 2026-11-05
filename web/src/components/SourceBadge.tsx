import type { Source } from '../../../functions/src/model.ts'

export default function SourceBadge({ sources }: { sources: Source[] }) {
  if (sources.includes('advocu')) return <span className="tag">{sources.includes('form') ? 'Form + Advocu' : 'Advocu'}</span>
  return null
}
