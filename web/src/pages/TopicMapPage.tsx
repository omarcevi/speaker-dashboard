import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../data/DataProvider.tsx'
import { mapView } from '../lib/topicMap.ts'

const SIZE = 1000
const MARGIN = 60
const LEGEND: [string, string][] = [
  ['pending', 'Pending (grey)'], ['maybe', 'Maybe (amber)'], ['approved', 'Approved (green)'], ['declined', 'Declined (red)'],
]
const px = (v: number) => MARGIN + v * (SIZE - 2 * MARGIN)

export default function TopicMapPage() {
  const { topicMap, cards, reviews } = useData()
  const view = useMemo(() => (topicMap ? mapView(topicMap, cards, reviews) : null), [topicMap, cards, reviews])
  if (!topicMap || !view) {
    return <div><h1>Topic map</h1><p>The topic map is being prepared — check back in a few minutes.</p></div>
  }
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
        {view.clusters.map((c) => (
          <g key={c.id}>
            <circle className="map-cluster" cx={px(c.cx)} cy={px(c.cy)} r={c.r * scale} />
            <text className="map-label" x={px(c.cx)} y={px(c.cy) - c.r * scale - 6} textAnchor="middle">{`${c.label} · ${c.count}`}</text>
          </g>
        ))}
        {view.dots.map((d) => (
          <Link key={d.card.id} to={`/talk/${d.card.id}`} aria-label={`${d.card.title} (${d.status})`}>
            <circle className={`dot st-${d.status}`} cx={px(d.x)} cy={px(d.y)} r={9}>
              <title>{d.card.title}</title>
            </circle>
          </Link>
        ))}
      </svg>
    </div>
  )
}
