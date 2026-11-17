import type { AdvocuDetails as Details, Source } from '../../../functions/src/model.ts'

export default function AdvocuDetails({ advocu, sources }: { advocu: Details; sources: Source[] }) {
  const fields: [string, string][] = [
    ['Session type', advocu.sessionTypes],
    ['Session length', advocu.sessionLength],
    ['In person or virtual', advocu.participation],
    ['Country and city', [advocu.country, advocu.city].filter((v) => v.trim()).join(', ')],
    ['Languages', advocu.languages],
    ['Levels', advocu.levels],
    ['Topics', advocu.topics],
    ['Advocu status', advocu.status],
    ['Eligible', advocu.eligible],
    ['Call for papers', advocu.cfpTitle],
  ]
  return (
    <>
      <h3>{sources.includes('form') ? 'Also on Advocu' : 'From Advocu'}</h3>
      <dl className="kv" style={{ gridTemplateColumns: '160px minmax(0, 1fr)', marginTop: 6 }}>
        {fields.filter(([, v]) => v.trim()).map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </>
  )
}
