import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, doc, onSnapshot, type QuerySnapshot } from 'firebase/firestore'
import type { AdvocuMeta, AiDoc, AiMeta, Comment, EmailDoc, EmailTemplate, EventSettings, MailMeta, Review, Score, Stage, Submission, SyncMeta, ThreadDoc, TopicMap } from '../../../functions/src/model.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import { db } from '../firebase.ts'
import { buildCards, type Card } from '../lib/cards.ts'
import { readExceptions, readStages, type Exceptions } from '../lib/stages.ts'

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
  templates: (EmailTemplate & { id: string })[]
  emails: (EmailDoc & { id: string })[]
  threads: (ThreadDoc & { id: string })[]
  event: EventSettings | null
  /** The team signature added to every email; '' when none. */
  signatureHtml: string
  mailMeta: MailMeta | null
  /** The email stages from `meta/stages`; [] when none are set up. */
  stages: Stage[]
  /** Per-speaker skipped / added stages, by speaker key. */
  speakerStages: Map<string, Exceptions>
  loading: boolean
  error: string | null
}

type Loaded = Omit<DataValue, 'cards' | 'loading' | 'signatureHtml'>

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
  templates: [],
  emails: [],
  threads: [],
  event: null,
  mailMeta: null,
  stages: [],
  speakerStages: new Map(),
  error: null,
}

const empty: DataValue = { ...emptyLoaded, cards: [], signatureHtml: '', loading: true }

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

const SOURCES = 16

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
      onSnapshot(collection(db, 'templates'), (snap) => {
        const templates = snap.docs.map((d) => ({ ...(d.data() as EmailTemplate), id: d.id }))
        setData((p) => ({ ...p, templates }))
        markReady('templates')
      }, fail('templates')),
      onSnapshot(collection(db, 'emails'), (snap) => {
        const emails = snap.docs.map((d) => ({ ...(d.data() as EmailDoc), id: d.id }))
        setData((p) => ({ ...p, emails }))
        markReady('emails')
      }, fail('emails')),
      onSnapshot(collection(db, 'threads'), (snap) => {
        const threads = snap.docs.map((d) => ({ ...(d.data() as ThreadDoc), id: d.id }))
        setData((p) => ({ ...p, threads }))
        markReady('threads')
      }, fail('threads')),
      onSnapshot(doc(db, 'meta', 'event'), (snap) => {
        setData((p) => ({ ...p, event: snap.exists() ? (snap.data() as EventSettings) : null }))
        markReady('event')
      }, fail('event')),
      onSnapshot(doc(db, 'meta', 'mail'), (snap) => {
        setData((p) => ({ ...p, mailMeta: snap.exists() ? (snap.data() as MailMeta) : null }))
        markReady('mailMeta')
      }, fail('mailMeta')),
      onSnapshot(doc(db, 'meta', 'stages'), (snap) => {
        setData((p) => ({ ...p, stages: readStages(snap.data()) }))
        markReady('stages')
      }, fail('stages')),
      onSnapshot(collection(db, 'speakerStages'), (snap) => {
        const speakerStages = new Map(snap.docs.map((d) => [d.id, readExceptions(d.data())]))
        setData((p) => ({ ...p, speakerStages }))
        markReady('speakerStages')
      }, fail('speakerStages')),
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
  const value = useMemo(
    () => ({ ...data, cards, signatureHtml: data.event?.signatureHtml ?? '', loading: allowed && ready.size < SOURCES }),
    [data, cards, allowed, ready],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataValue {
  return useContext(DataContext)
}
