import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { AiDoc, AiMeta, AiNeighbor, SubmissionData, TopicMap } from '../model.js';
import type { AiClient } from './client.js';
import { embeddingInput, overviewInput } from './inputs.js';
import { clusterCount, kmeans, nearest, project2d } from './vectors.js';

export const AI_CAP = 100;
export const AI_CONCURRENCY = 5;
export const NEIGHBORS = 30;
const BATCH_SIZE = 400;
const MAX_ERROR = 200;

export interface RefreshAiOptions { cap?: number; concurrency?: number; now?: Date; onlyId?: string }
export interface RefreshAiResult { generated: number; pending: number; failed: string[]; deleted: number; mapUpdated: boolean }

/** `onlyId` names no present submission with a title. Thrown before anything is read from the model or written. */
export class AiNotFound extends Error {}

const short = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, MAX_ERROR);
const inCorpus = (d: FirebaseFirestore.DocumentData) =>
  d.removedFromSheet !== true && typeof d.title === 'string' && d.title.trim() !== '';
const sameIds = (a: string[], b: string[]) => {
  const sb = new Set(b);
  return a.length === sb.size && a.every(x => sb.has(x));
};

async function commitAll(db: Firestore, writes: ((b: FirebaseFirestore.WriteBatch) => void)[]) {
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_SIZE).forEach(w => w(batch));
    await batch.commit();
  }
}

/** Runs `fn` over `items` with at most `n` in flight. `fn` must not throw. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]!); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
}

/**
 * Brings `ai/*`, `aiVectors/*`, `meta/topicMap` and `meta/ai` up to date with the present titled submissions.
 * Per-document model failures are recorded on `ai/{id}.error` and `meta/ai.error`, never thrown.
 * Logs ids, counts and error messages only: never prompts, model output or submission text.
 */
export async function refreshAi(db: Firestore, client: AiClient, opts: RefreshAiOptions = {}): Promise<RefreshAiResult> {
  const cap = opts.cap ?? AI_CAP;
  const at = Timestamp.fromDate(opts.now ?? new Date());

  // aiVectors is read only when the map is recomputed: ai/{id} and aiVectors/{id} are always written together.
  const [subSnap, aiSnap, mapSnap] = await Promise.all([
    db.collection('submissions').get(),
    db.collection('ai').get(),
    db.doc('meta/topicMap').get(),
  ]);
  const present = new Map<string, SubmissionData>();
  for (const d of subSnap.docs) if (inCorpus(d.data())) present.set(d.id, d.data() as SubmissionData);
  const ais = new Map(aiSnap.docs.map(d => [d.id, d.data() as AiDoc]));

  if (opts.onlyId !== undefined && !present.has(opts.onlyId)) {
    throw new AiNotFound('No present submission with a title has that id.');
  }

  // Due: no ai doc yet, or it was made from other text. Docs never generated go first.
  const normallyDue = [...present].filter(([id, s]) => ais.get(id)?.sourceHash !== s.contentHash).map(([id]) => id)
    .sort((a, b) => Number(ais.has(a)) - Number(ais.has(b)) || (a < b ? -1 : a > b ? 1 : 0));
  const todo = (opts.onlyId !== undefined ? [opts.onlyId] : normallyDue).slice(0, Math.max(0, cap));

  // 1. Generate.
  const generated = new Set<string>();
  const errors = new Map<string, string>();
  await pool(todo, opts.concurrency ?? AI_CONCURRENCY, async id => {
    const s = present.get(id)!;
    const prev = ais.get(id);
    const aiRef = db.doc(`ai/${id}`);
    try {
      const ov = await client.overview(overviewInput(s));
      const [vector] = await client.embed([embeddingInput(s)]);
      if (!Array.isArray(vector) || vector.length === 0) throw new Error('invalid embedding response');
      const doc: AiDoc = {
        sourceHash: s.contentHash,
        overview: { ...ov.fields, model: ov.model, generatedAt: at },
        neighbors: prev?.neighbors ?? [],
        error: null,
      };
      const batch = db.batch();
      batch.set(aiRef, doc);
      batch.set(db.doc(`aiVectors/${id}`), { vector, sourceHash: s.contentHash });
      await batch.commit();
      ais.set(id, doc);
      generated.add(id);
    } catch (e) {
      const message = short(e);
      errors.set(id, message);
      console.error(`AI refresh failed for ${id}: ${message}`);
      try {
        // Keep the previous overview and sourceHash, so the box shows "updating…" rather than nothing.
        if (prev) await aiRef.update({ error: message });
        else {
          const doc: AiDoc = { sourceHash: '', overview: null, neighbors: [], error: message };
          await aiRef.set(doc);
          ais.set(id, doc);
        }
      } catch (e2) {
        console.error(`AI refresh could not record the error for ${id}: ${short(e2)}`);
      }
    }
  });

  // 2. Delete results for documents that are removed, untitled or gone.
  const stale = [...ais.keys()].filter(id => !present.has(id));
  await deleteResults(db, stale);
  stale.forEach(id => ais.delete(id));
  let deleted = stale.length;

  // 3. Neighbours and the map. meta/topicMap is written last, so everything here is judged against it, never against
  // this run alone: a run stopped before its map step leaves overviews newer than the map, and the next run recomputes.
  const prevMap = mapSnap.data() as TopicMap | undefined;
  const prevAt = prevMap?.generatedAt?.toMillis() ?? null;
  const mapIds = [...ais].filter(([id, d]) => present.has(id) && d.overview).map(([id]) => id);
  const newest = Math.max(-Infinity, ...mapIds.map(id => ais.get(id)!.overview!.generatedAt.toMillis()));
  const mapUpdated = generated.size > 0 || stale.length > 0 || !prevMap || prevAt === null || prevMap.error != null ||
    newest > prevAt || !sameIds(mapIds, prevMap.points.map(p => p.id));
  if (mapUpdated) {
    const vecSnap = await db.collection('aiVectors').get();
    const orphans = vecSnap.docs.map(d => d.id).filter(id => !present.has(id));
    await deleteResults(db, orphans);
    deleted += orphans.length;
    const vectors = new Map(vecSnap.docs.map(d => [d.id, d.get('vector') as number[]]));
    const vecs = new Map(mapIds.filter(id => vectors.has(id)).map(id => [id, vectors.get(id)!]));
    await writeMap(db, client, present, ais, vecs, at);
  }

  // 4. Run summary. Pending is the normal backlog, also after an onlyId run.
  const pending = normallyDue.filter(id => !generated.has(id)).length;
  const firstError = todo.map(id => errors.get(id)).find(m => m !== undefined) ?? null;
  const meta: AiMeta = { lastRunAt: at, generated: generated.size, pending, error: firstError };
  await db.doc('meta/ai').set(meta);

  const result = { generated: generated.size, pending, failed: todo.filter(id => errors.has(id)), deleted, mapUpdated };
  console.log(`AI refresh: generated=${result.generated} pending=${pending} failed=[${result.failed.join(',')}] deleted=${result.deleted} mapUpdated=${mapUpdated}`);
  return result;
}

async function deleteResults(db: Firestore, ids: string[]) {
  await commitAll(db, ids.flatMap(id => [
    (b: FirebaseFirestore.WriteBatch) => b.delete(db.doc(`ai/${id}`)),
    (b: FirebaseFirestore.WriteBatch) => b.delete(db.doc(`aiVectors/${id}`)),
  ]));
}

async function writeMap(
  db: Firestore, client: AiClient, present: Map<string, SubmissionData>, ais: Map<string, AiDoc>,
  vecs: Map<string, number[]>, at: Timestamp,
) {
  const near = nearest(vecs, NEIGHBORS);
  const xy = project2d(vecs);
  const raw = kmeans(vecs, clusterCount(vecs.size));
  // kmeans can leave clusters empty: number the clusters actually used 0..m-1.
  const used = [...new Set(raw.values())].sort((a, b) => a - b);
  const index = new Map(used.map((c, i) => [c, i]));
  const ids = [...vecs.keys()].sort();
  const cluster = (id: string) => index.get(raw.get(id)!)!;
  const groups: string[][] = used.map(() => []);
  for (const id of ids) groups[cluster(id)]!.push(present.get(id)!.title);

  let labels = groups.map((_, i) => `Group ${i + 1}`);
  let error: string | null = null;
  if (groups.length > 0) {
    try {
      const named = await client.nameClusters(groups);
      labels = labels.map((fallback, i) => (typeof named[i] === 'string' && named[i]!.trim() ? named[i]!.trim() : fallback));
    } catch (e) {
      error = short(e);
      console.error(`AI cluster naming failed: ${error}`);
    }
  }

  // Only rewrite neighbours that changed, so members' listeners don't churn.
  const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  for (const id of ids) {
    const neighbors: AiNeighbor[] = near.get(id) ?? [];
    const prev = ais.get(id);
    if (!prev || JSON.stringify(prev.neighbors) === JSON.stringify(neighbors)) continue;
    writes.push(b => b.set(db.doc(`ai/${id}`), { neighbors }, { merge: true }));
  }
  await commitAll(db, writes);

  const map: TopicMap = {
    points: ids.map(id => ({ id, x: xy.get(id)!.x, y: xy.get(id)!.y, cluster: cluster(id) })),
    clusters: labels.map((label, id) => ({ id, label })),
    generatedAt: at,
    error,
  };
  await db.doc('meta/topicMap').set(map);
}
