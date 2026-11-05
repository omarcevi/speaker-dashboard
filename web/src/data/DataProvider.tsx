import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, doc, onSnapshot, type QuerySnapshot } from 'firebase/firestore'
import type { AdvocuMeta, AiDoc, AiMeta, Comment, Review, Score, Submission, SyncMeta, TopicMap } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { db } from '../firebase.ts'
import { buildCards, type Card } from '../lib/cards.ts'

type CommentWithId = Comment & { id: string }

interface DataValue {
  submissions: Submission[]
  cards: Card[] // submissions grouped into reviewable talks (see lib/cards.ts)
  reviews: Map<string, Review>
  scores: Map<string, Score[]>
  comments: Map<string, CommentWithId[]>
  sync: SyncMeta | null
  advocuMeta: AdvocuMeta | null
  ai: Map<string, AiDoc>
  topicMap: TopicMap | null
  aiMeta: AiMeta | null
  loading: boolean
  error: string | null
}

type Loaded = Omit<DataValue, 'cards' | 'loading'>

const emptyLoaded: Loaded = {
  submissions: [],
  reviews: new Map(),
  scores: new Map(),
  comments: new Map(),
  sync: null,
  advocuMeta: null,
  ai: new Map(),
  topicMap: null,
  aiMeta: null,
  error: null,
}

const empty: DataValue = { ...emptyLoaded, cards: [], loading: true }

const DataContext = createContext<DataValue>(empty)

function groupBySubmission<T extends { submissionId: string }>(snap: QuerySnapshot, make: (id: string, d: unknown) => T) {
  const map = new Map<string, T[]>()
  for (const d of snap.docs) {
    const item = make(d.id, d.data())
    const list = map.get(item.submissionId)
    if (list) list.push(item)
    else map.set(item.submissionId, [item])
  }
  return map
}

const SOURCES = 9

export function DataProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  const role = me?.role
  const allowed = role === 'member' || role === 'admin'

  const [data, setData] = useState<Loaded>(emptyLoaded)
  const [ready, setReady] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!allowed) return
    const markReady = (key: string) => setReady((r) => (r.has(key) ? r : new Set(r).add(key)))
    const fail = (key: string) => (e: Error) => {
      console.error(`Listener ${key} failed`, e)
      setData((p) => ({ ...p, error: "Couldn't load live data. Some information may be missing or out of date." }))
      markReady(key)
    }
    const unsubs = [
      onSnapshot(collection(db, 'submissions'), (snap) => {
        const submissions = snap.docs.map((d) => ({ ...(d.data() as Submission), id: d.id }))
        setData((p) => ({ ...p, submissions }))
        markReady('submissions')
      }, fail('submissions')),
      onSnapshot(collection(db, 'reviews'), (snap) => {
        const reviews = new Map(snap.docs.map((d) => [d.id, d.data() as Review]))
        setData((p) => ({ ...p, reviews }))
        markReady('reviews')
      }, fail('reviews')),
      onSnapshot(collection(db, 'scores'), (snap) => {
        const scores = groupBySubmission(snap, (_id, d) => d as Score)
        setData((p) => ({ ...p, scores }))
        markReady('scores')
      }, fail('scores')),
      onSnapshot(collection(db, 'comments'), (snap) => {
        const comments = groupBySubmission(snap, (id, d) => ({ ...(d as Comment), id }))
        setData((p) => ({ ...p, comments }))
        markReady('comments')
      }, fail('comments')),
      onSnapshot(doc(db, 'meta', 'sync'), (snap) => {
        setData((p) => ({ ...p, sync: snap.exists() ? (snap.data() as SyncMeta) : null }))
        markReady('sync')
      }, fail('sync')),
      onSnapshot(doc(db, 'meta', 'advocu'), (snap) => {
        setData((p) => ({ ...p, advocuMeta: snap.exists() ? (snap.data() as AdvocuMeta) : null }))
        markReady('advocu')
      }, fail('advocu')),
      onSnapshot(collection(db, 'ai'), (snap) => {
        const ai = new Map(snap.docs.map((d) => [d.id, d.data() as AiDoc]))
        setData((p) => ({ ...p, ai }))
        markReady('ai')
      }, fail('ai')),
      onSnapshot(doc(db, 'meta', 'topicMap'), (snap) => {
        setData((p) => ({ ...p, topicMap: snap.exists() ? (snap.data() as TopicMap) : null }))
        markReady('topicMap')
      }, fail('topicMap')),
      onSnapshot(doc(db, 'meta', 'ai'), (snap) => {
        setData((p) => ({ ...p, aiMeta: snap.exists() ? (snap.data() as AiMeta) : null }))
        markReady('aiMeta')
      }, fail('aiMeta')),
    ]
    return () => {
      unsubs.forEach((u) => u())
      setData(emptyLoaded)
      setReady(new Set())
    }
  }, [allowed])

  const { submissions, reviews, scores, comments } = data
  const cards = useMemo(
    () => buildCards(submissions, (id) => reviews.has(id) || scores.has(id) || comments.has(id)),
    [submissions, reviews, scores, comments],
  )
  const value = useMemo(() => ({ ...data, cards, loading: allowed && ready.size < SOURCES }), [data, cards, allowed, ready])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataValue {
  return useContext(DataContext)
}
