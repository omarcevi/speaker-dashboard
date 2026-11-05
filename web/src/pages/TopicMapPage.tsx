import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider.tsx'
import { useData } from '../data/DataProvider.tsx'
import { aiStatusNotes, mapView } from '../lib/topicMap.ts'

const SIZE = 1000
const MARGIN = 60
const LEGEND: [string, string][] = [
  ['pending', 'Pending (grey)'], ['maybe', 'Maybe (amber)'], ['approved', 'Approved (green)'], ['declined', 'Declined (red)'],
]
const CHAR_W = 13
const LABEL_H = 24
const px = (v: number) => MARGIN + v * (SIZE - 2 * MARGIN)

// Admins only: pending overviews and the last run's problem, if any. Nothing when all is well.
function AiStatus() {
  const { me } = useAuth()
  const { aiMeta, topicMap } = useData()
  if (me?.role !== 'admin') return null
  const notes = aiStatusNotes(aiMeta, topicMap)
  if (notes.length === 0) return null
  return <div className="muted" role="status">{notes.map((n) => <p key={n}>{n}</p>)}</div>
}

export default function TopicMapPage() {
  const { topicMap, cards, reviews } = useData()
  const view = useMemo(() => (topicMap ? mapView(topicMap, cards, reviews) : null), [topicMap, cards, reviews])
  if (!topicMap || topicMap.points.length === 0) {
    return <div><h1>Topic map</h1><p>The topic map is being prepared — check back in a few minutes.</p><AiStatus /></div>
  }
  if (!view) return null
  const scale = SIZE - 2 * MARGIN
  return (
    <div className="topic-map">
      <h1>Topic map</h1>
      <p>Talks on similar topics sit close together. Each dot is a talk; select one to open it.</p>
      <ul className="map-legend" aria-label="Legend">
        {LEGEND.map(([s, text]) => (
          <li key={s}><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className={`dot st-${s}`} /></svg> {text}</li>
        ))}
      </ul>
      <svg className="map-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Topic map of talks">
        {view.clusters.map((c) => {
          const text = `${c.label} · ${c.count}`
          const half = (text.length * CHAR_W) / 2
          const lx = Math.min(Math.max(px(c.cx), half + 4), SIZE - half - 4)
          const ly = Math.min(Math.max(px(c.cy) - c.r * scale - 6, LABEL_H), SIZE - 4)
          return (
            <g key={c.id}>
              <circle className="map-cluster" cx={px(c.cx)} cy={px(c.cy)} r={c.r * scale} />
              <text className="map-label" x={lx} y={ly} textAnchor="middle">{text}</text>
            </g>
          )
        })}
        {view.dots.map((d) => (
          <Link key={d.card.id} to={`/talk/${d.card.id}`} aria-label={`${d.card.title} (${d.status})`}>
            <title>{d.card.title}</title>
            <circle className="hit" cx={px(d.x)} cy={px(d.y)} r={18} />
            <circle className={`dot st-${d.status}`} cx={px(d.x)} cy={px(d.y)} r={9} />
          </Link>
        ))}
      </svg>
      <AiStatus />
    </div>
  )
}
