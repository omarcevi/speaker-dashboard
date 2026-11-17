import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { STATUSES, type Status } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import StatusFilter from '../components/StatusFilter.tsx'
import { statusLabel } from '../components/StatusChip.tsx'
import { useData } from '../data/DataProvider.tsx'
import { formatWhen } from '../lib/syncStatus.ts'
import { aiStatusNotes, mapView } from '../lib/topicMap.ts'

const PHONE = '(max-width: 720px)'
const subscribe = (cb: () => void) => { const m = matchMedia(PHONE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }
const usePhone = () => useSyncExternalStore(subscribe, () => matchMedia(PHONE).matches, () => false)

// Admins only: pending overviews and the last run's problem, if any. Nothing when all is well.
function AiStatus() {
  const { me } = useAuth()
  const { aiMeta, topicMap } = useData()
  if (me?.role !== 'admin') return null
  const notes = aiStatusNotes(aiMeta, topicMap)
  if (notes.length === 0) return null
  return <div className="ai-status" role="status">{notes.map((n) => <p key={n}>{n}</p>)}</div>
}

export default function TopicMapPage() {
  const { topicMap, cards, reviews } = useData()
  const [active, setActive] = useState<Status | 'all'>('all')
  const phone = usePhone()
  const view = useMemo(() => (topicMap ? mapView(topicMap, cards, reviews) : null), [topicMap, cards, reviews])
  const live = cards.filter((c) => !c.removedFromSheet).length
  const updated = topicMap?.generatedAt ? `Map updated ${formatWhen(topicMap.generatedAt.toMillis())}` : null

  const head = (
    <div className="title-row">
      <div><h1>Topic map</h1><p className="lede">Talks on similar topics sit close together. Select a dot to open the talk.</p></div>
      {updated && <span className="stamp">{updated}</span>}
    </div>
  )
  if (!topicMap || topicMap.points.length === 0 || !view) {
    return <>{head}<div className="card map-empty" style={{ marginTop: 24 }}>The topic map is being prepared. Check back in a few minutes.</div><AiStatus /></>
  }

  const counts = { all: view.dots.length, pending: 0, maybe: 0, approved: 0, declined: 0 }
  for (const d of view.dots) counts[d.status]++
  const missing = live - view.dots.length

  // Fit the clusters (dots and hulls) into a landscape frame on desktop and a square one on a phone, with room above
  // for the labels. One scale for both axes, so distances stay true and every hull fits inside the frame.
  const W = 1000
  const H = phone ? 1000 : 600
  const PAD = 24
  const TOP = phone ? 60 : 44
  const label = phone ? 34 : 19
  const dotR = phone ? 18 : 11
  const xs = [...view.dots.map((d) => d.x), ...view.clusters.flatMap((c) => [c.cx - c.r, c.cx + c.r])]
  const ys = [...view.dots.map((d) => d.y), ...view.clusters.flatMap((c) => [c.cy - c.r, c.cy + c.r])]
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const scale = Math.min((W - 2 * PAD) / Math.max(maxX - minX, 1e-6), (H - TOP - PAD) / Math.max(maxY - minY, 1e-6))
  const ox = (W - (maxX - minX) * scale) / 2 - minX * scale
  const oy = TOP + (H - TOP - PAD - (maxY - minY) * scale) / 2 - minY * scale
  const X = (v: number) => ox + v * scale
  const Y = (v: number) => oy + v * scale
  const halfWidth = (text: string) => (text.length * label * 0.55) / 2

  // Place each label above its hull, then move it to the first spot that covers no dot and no earlier label:
  // further up, beside, or under the hull.
  const dotsAt = view.dots.map((d) => [X(d.x), Y(d.y)] as const)
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const labels = view.clusters.map((c) => {
    const text = `${c.label} ${c.count}`
    const half = halfWidth(text)
    const clampX = (x: number) => Math.min(Math.max(x, half + 4), W - half - 4)
    const clampY = (y: number) => Math.min(Math.max(y, label + 4), H - 4)
    const top = Y(c.cy) - c.r * scale
    const bottom = Y(c.cy) + c.r * scale
    const step = label + 6
    const spots: [number, number][] = [
      [X(c.cx), top - 10], [X(c.cx), top - 10 - step], [X(c.cx), top - 10 - 2 * step],
      [X(c.cx) - half, top - 10], [X(c.cx) + half, top - 10],
      [X(c.cx), bottom + label + 6], [X(c.cx), bottom + label + 6 + step],
    ]
    const box = (x: number, y: number) => ({ x0: x - half - 4, x1: x + half + 4, y0: y - label, y1: y + 6 })
    const clear = (b: ReturnType<typeof box>) =>
      dotsAt.every(([dx, dy]) => dx < b.x0 - dotR || dx > b.x1 + dotR || dy < b.y0 - dotR || dy > b.y1 + dotR)
      && placed.every((p) => b.x1 < p.x0 || b.x0 > p.x1 || b.y1 < p.y0 || b.y0 > p.y1)
    const spot = spots.map(([x, y]) => [clampX(x), clampY(y)] as const).find(([x, y]) => clear(box(x, y)))
      ?? [clampX(X(c.cx)), clampY(top - 10)] as const
    placed.push(box(spot[0], spot[1]))
    return { id: c.id, label: c.label, count: c.count, x: spot[0], y: spot[1] }
  })

  return (
    <>
      {head}
      <StatusFilter counts={counts} active={active} onSelect={setActive} label="Highlight a status" />
      {missing > 0 && (
        <p className="muted" style={{ marginTop: 12 }}>
          {view.dots.length} of {live} talks are on the map. {missing === 1 ? 'One isn’t' : `${missing} aren’t`} yet: talks without a session are left out, and new talks appear after the next AI run.
        </p>
      )}
      <div className="map-layout">
        <div className="card map-card">
          <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Topic map of talks">
            {view.clusters.map((c) => <circle key={c.id} className="map-cluster" cx={X(c.cx)} cy={Y(c.cy)} r={c.r * scale} />)}
            {view.dots.map((d) => (
              <Link key={d.card.id} to={`/talk/${d.card.id}`} className={`st-${d.status}${active !== 'all' && d.status !== active ? ' dim' : ''}`}
                aria-label={`${d.card.title} (${statusLabel(d.status)})`}>
                <title>{`${d.card.title} · ${d.card.firstName} ${d.card.lastName}`}</title>
                <circle className="map-dot" cx={X(d.x)} cy={Y(d.y)} r={dotR} />
              </Link>
            ))}
            {/* Labels last, so no hull or dot is painted over them. */}
            {labels.map((l) => (
              <text key={l.id} className="map-label" x={l.x} y={l.y} textAnchor="middle" style={{ fontSize: label }}>
                {l.label} <tspan className="map-label-n" style={{ fontSize: label * 0.88 }}>{l.count}</tspan>
              </text>
            ))}
          </svg>
        </div>
        <section className="card pad" aria-label="Clusters">
          <div className="card-head"><h2>Clusters</h2><span className="muted num">{view.clusters.length}</span></div>
          <ul className="cluster-list">
            {view.clusters.map((c) => {
              const own = view.dots.filter((d) => d.cluster === c.id)
              const n = (s: Status) => own.filter((d) => d.status === s).length
              const present = STATUSES.filter((s) => n(s) > 0)
              return (
                <li key={c.id}>
                  <div className="line"><b style={{ fontWeight: 500 }}>{c.label}</b><span className="num muted">{c.count}</span></div>
                  <div className="strip" aria-hidden="true">{present.map((s) => <i key={s} className={`st-${s}`} style={{ flex: n(s) }} />)}</div>
                  <div className="cell-sub">{present.map((s) => `${n(s)} ${statusLabel(s).toLowerCase()}`).join(' · ')}</div>
                </li>
              )
            })}
          </ul>
          <p className="foot-note">Dot colours are the review statuses. Pick a status above to fade the others.</p>
        </section>
      </div>
      <AiStatus />
    </>
  )
}
