import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { applySync } from '../src/sync/applySync.js';
import { fakeSheet, makeRow } from '../src/testing/fakeRows.js';
import { fakeAiClient } from '../src/testing/fakeAiClient.js';
import { vertexAiClient, type AiClient, type GenAiLike } from '../src/ai/client.js';
import { refreshAi, AiNotFound } from '../src/ai/refreshAi.js';
import type { AiDoc, AiMeta, SubmissionData, TopicMap } from '../src/model.js';

getApps().length || initializeApp({ projectId: 'demo-cfp' });
const db = getFirestore();
const t1 = new Date('2026-11-05T10:00:00Z');
const t2 = new Date('2026-11-05T10:15:00Z');
const ts = (d: Date) => Timestamp.fromDate(d);

/** Present submissions with a title: the AI corpus. */
async function corpus(): Promise<Map<string, SubmissionData>> {
  const snap = await db.collection('submissions').get();
  return new Map(snap.docs
    .filter(d => d.get('removedFromSheet') !== true && String(d.get('title') ?? '').trim() !== '')
    .map(d => [d.id, d.data() as SubmissionData]));
}
async function idOf(title: string): Promise<string> {
  const snap = await db.collection('submissions').where('title', '==', title).get();
  expect(snap.size).toBe(1);
  return snap.docs[0]!.id;
}
const ids = async (col: string) => (await db.collection(col).get()).docs.map(d => d.id).sort();
const ai = async (id: string) => (await db.doc(`ai/${id}`).get()).data() as AiDoc | undefined;
const vec = async (id: string) => (await db.doc(`aiVectors/${id}`).get()).data() as { vector: number[]; sourceHash: string } | undefined;
const topicMap = async () => (await db.doc('meta/topicMap').get()).data() as TopicMap;
const aiMeta = async () => (await db.doc('meta/ai').get()).data() as AiMeta;

describe('refreshAi', () => {
  beforeEach(async () => {
    await Promise.all(['submissions', 'ai', 'aiVectors', 'meta'].map(c => db.recursiveDelete(db.collection(c))));
    await applySync(db, fakeSheet());
  });

  it('first run generates overview, vectors, neighbors and map', async () => {
    const subs = await corpus();
    const n = subs.size;
    expect(n).toBeGreaterThan(5);
    const client = fakeAiClient();
    const r = await refreshAi(db, client, { now: t1 });

    expect(r).toEqual({ generated: n, pending: 0, failed: [], deleted: 0, mapUpdated: true });
    expect(client.calls).toEqual({ overview: n, embed: n });
    const corpusIds = [...subs.keys()].sort();
    expect(await ids('ai')).toEqual(corpusIds);
    expect(await ids('aiVectors')).toEqual(corpusIds);
    for (const [id, s] of subs) {
      const doc = (await ai(id))!;
      expect(doc).toMatchObject({ sourceHash: s.contentHash, error: null });
      expect(doc.overview).toMatchObject({ model: 'fake-overview', generatedAt: ts(t1) });
      expect(doc.overview!.talk).toBeTruthy();
      expect(doc.neighbors).toHaveLength(Math.min(30, n - 1));
      const nIds = doc.neighbors.map(x => x.id);
      expect(nIds).not.toContain(id);
      nIds.forEach(x => expect(subs.has(x)).toBe(true));
      const scores = doc.neighbors.map(x => x.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      const v = (await vec(id))!;
      expect(v.sourceHash).toBe(s.contentHash);
      expect(v.vector).toHaveLength(768);
    }

    const map = await topicMap();
    expect(map).toMatchObject({ error: null, generatedAt: ts(t1) });
    expect(map.points.map(p => p.id).sort()).toEqual(corpusIds);
    const clusterIds = map.clusters.map(c => c.id);
    expect(clusterIds).toEqual(clusterIds.map((_, i) => i));
    for (const p of map.points) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1);
      expect(clusterIds).toContain(p.cluster);
    }
    for (const c of map.clusters) {
      expect(map.points.some(p => p.cluster === c.id)).toBe(true);
      expect(c.label.trim()).not.toBe('');
    }
    expect(await aiMeta()).toEqual({ lastRunAt: ts(t1), generated: n, pending: 0, error: null });
  });

  it('second run with no changes calls the model zero times', async () => {
    const client = fakeAiClient();
    const naming = vi.spyOn(client, 'nameClusters');
    await refreshAi(db, client, { now: t1 });
    const calls = { ...client.calls };
    const mapBefore = await topicMap();
    expect(naming).toHaveBeenCalledTimes(1);

    const r = await refreshAi(db, client, { now: t2 });
    expect(r).toEqual({ generated: 0, pending: 0, failed: [], deleted: 0, mapUpdated: false });
    expect(client.calls).toEqual(calls);
    expect(naming).toHaveBeenCalledTimes(1);
    expect(await topicMap()).toEqual(mapBefore);
    expect((await aiMeta()).lastRunAt).toEqual(ts(t2));
  });

  it('regenerates when contentHash changes', async () => {
    const client = fakeAiClient();
    await refreshAi(db, client, { now: t1 });
    const id = await idOf('Fake Talk One');
    const oldHash = (await ai(id))!.sourceHash;

    const edited = fakeSheet();
    edited[1] = makeRow({ title: 'Fake Talk One, Revised' });
    await applySync(db, edited);
    const subs = await corpus();
    const newHash = subs.get(id)!.contentHash;
    expect(newHash).not.toBe(oldHash);

    const before = client.calls.overview;
    const r = await refreshAi(db, client, { now: t2 });
    expect(r).toMatchObject({ generated: 1, pending: 0, failed: [], deleted: 0, mapUpdated: true });
    expect(client.calls.overview).toBe(before + 1);
    const doc = (await ai(id))!;
    expect(doc.sourceHash).toBe(newHash);
    expect(doc.overview!.generatedAt).toEqual(ts(t2));
    expect((await vec(id))!.sourceHash).toBe(newHash);
    for (const other of subs.keys()) {
      if (other !== id) expect((await ai(other))!.overview!.generatedAt).toEqual(ts(t1));
    }
  });

  it('respects the cap and reports pending', async () => {
    const n = (await corpus()).size;
    const client = fakeAiClient();
    const r1 = await refreshAi(db, client, { cap: 2 });
    expect(r1).toMatchObject({ generated: 2, pending: n - 2, failed: [] });
    expect(client.calls.overview).toBe(2);
    expect(await ids('ai')).toHaveLength(2);
    expect((await aiMeta()).pending).toBe(n - 2);
    expect((await topicMap()).points).toHaveLength(2);

    const r2 = await refreshAi(db, client);
    expect(r2).toMatchObject({ generated: n - 2, pending: 0, failed: [], mapUpdated: true });
    expect((await aiMeta()).pending).toBe(0);
    expect((await topicMap()).points).toHaveLength(n);
    for (const id of await ids('ai')) expect((await ai(id))!.neighbors).toHaveLength(Math.min(30, n - 1));
  });

  it('runs at most `concurrency` documents at once', async () => {
    const base = fakeAiClient();
    let inFlight = 0;
    let peak = 0;
    const client: AiClient = {
      ...base,
      async overview(input) {
        inFlight++;
        peak = Math.max(peak, inFlight);
        try {
          await new Promise(res => setTimeout(res, 20));
          return await base.overview(input);
        } finally { inFlight--; }
      },
    };
    const r = await refreshAi(db, client, { concurrency: 3 });
    expect(r.generated).toBe((await corpus()).size);
    expect(peak).toBe(3);
  });

  it('one failing document doesn’t stop the run', async () => {
    const subs = await corpus();
    const n = subs.size;
    const bad = await idOf('Kernel Things');
    const r = await refreshAi(db, fakeAiClient({ fail: new Set(['Kernel Things']) }));

    expect(r).toMatchObject({ generated: n - 1, pending: 1, failed: [bad], mapUpdated: true });
    expect(await ai(bad)).toEqual({ sourceHash: '', overview: null, neighbors: [], error: expect.stringContaining('fake ai failure') });
    expect(await vec(bad)).toBeUndefined();
    for (const id of subs.keys()) {
      if (id === bad) continue;
      const doc = (await ai(id))!;
      expect(doc.error).toBeNull();
      expect(doc.overview).not.toBeNull();
      expect(doc.neighbors.map(x => x.id)).not.toContain(bad);
    }
    const meta = await aiMeta();
    expect(meta).toMatchObject({ generated: n - 1, pending: 1 });
    expect(meta.error).toContain('fake ai failure');
    expect((await topicMap()).points.map(p => p.id)).not.toContain(bad);

    // The next healthy run picks it up and clears the errors.
    const healthy = fakeAiClient();
    const r2 = await refreshAi(db, healthy);
    expect(r2).toMatchObject({ generated: 1, pending: 0, failed: [] });
    expect(healthy.calls.overview).toBe(1);
    expect((await ai(bad))!.error).toBeNull();
    expect((await aiMeta()).error).toBeNull();
    expect((await topicMap()).points.map(p => p.id)).toContain(bad);
  });

  it('a failed regeneration keeps the previous overview and hash', async () => {
    await refreshAi(db, fakeAiClient(), { now: t1 });
    const id = await idOf('Fake Talk One');
    const before = (await ai(id))!;
    const vecBefore = await vec(id);

    const edited = fakeSheet();
    edited[1] = makeRow({ title: 'Fake Talk One', abstract: 'An abstract with BREAKME inside.' });
    await applySync(db, edited);
    const newHash = (await corpus()).get(id)!.contentHash;
    expect(newHash).not.toBe(before.sourceHash);

    const r = await refreshAi(db, fakeAiClient({ fail: new Set(['BREAKME']) }), { now: t2 });
    expect(r).toMatchObject({ generated: 0, pending: 1, failed: [id] });
    expect(await ai(id)).toEqual({ ...before, error: expect.stringContaining('fake ai failure') });
    expect(await vec(id)).toEqual(vecBefore);
  });

  it('removed submissions lose their ai docs', async () => {
    const client = fakeAiClient();
    await refreshAi(db, client);
    const removed = await idOf('Small Tools'); // last sheet row
    const gone = await idOf('Frequency Hopping Apps');
    const untitled = await idOf('Fake Talk Two');

    const sheet = fakeSheet().slice(0, -1);
    sheet[2] = makeRow({ email: 'Ada@Example.com', title: '', area: 'Cloud' });
    await applySync(db, sheet);
    await db.doc(`submissions/${gone}`).delete();

    const r = await refreshAi(db, client);
    expect(r).toMatchObject({ generated: 0, deleted: 3, failed: [], mapUpdated: true });
    for (const id of [removed, gone, untitled]) {
      expect(await ai(id)).toBeUndefined();
      expect(await vec(id)).toBeUndefined();
    }
    const left = [...(await corpus()).keys()].sort();
    expect(await ids('ai')).toEqual(left);
    expect(await ids('aiVectors')).toEqual(left);
    expect((await topicMap()).points.map(p => p.id).sort()).toEqual(left);
    for (const id of left) (await ai(id))!.neighbors.forEach(x => expect(left).toContain(x.id));
  });

  it('onlyId regenerates one doc even when fresh', async () => {
    const client = fakeAiClient();
    await refreshAi(db, client, { now: t1 });
    const id = await idOf('Compilers For Everyone');
    const before = client.calls.overview;

    const r = await refreshAi(db, client, { onlyId: id, cap: 1, now: t2 });
    expect(r).toEqual({ generated: 1, pending: 0, failed: [], deleted: 0, mapUpdated: true });
    expect(client.calls.overview).toBe(before + 1);
    expect((await ai(id))!.overview!.generatedAt).toEqual(ts(t2));
    for (const other of (await corpus()).keys()) {
      if (other !== id) expect((await ai(other))!.overview!.generatedAt).toEqual(ts(t1));
    }
  });

  it('onlyId keeps the real backlog in meta/ai.pending', async () => {
    const subs = await corpus();
    const n = subs.size;
    const client = fakeAiClient();
    await refreshAi(db, client, { cap: 3 });
    const done = await ids('ai');

    const r1 = await refreshAi(db, client, { onlyId: done[0], cap: 1 });
    expect(r1).toMatchObject({ generated: 1, pending: n - 3 });
    expect((await aiMeta()).pending).toBe(n - 3);

    const waiting = [...subs.keys()].find(id => !done.includes(id))!;
    const r2 = await refreshAi(db, client, { onlyId: waiting, cap: 1 });
    expect(r2).toMatchObject({ generated: 1, pending: n - 4 });
    expect((await aiMeta()).pending).toBe(n - 4);
  });

  it('onlyId for an untitled or unknown doc is refused before any work', async () => {
    const untitled = (await db.collection('submissions').where('title', '==', '').get()).docs[0]!.id;
    const client = fakeAiClient();
    await expect(refreshAi(db, client, { onlyId: untitled, cap: 1 })).rejects.toBeInstanceOf(AiNotFound);
    await expect(refreshAi(db, client, { onlyId: 'no-such-doc', cap: 1 })).rejects.toBeInstanceOf(AiNotFound);
    expect(client.calls).toEqual({ overview: 0, embed: 0 });
    expect((await db.doc('meta/ai').get()).exists).toBe(false);
  });

  it('invalid model output is rejected, not stored', async () => {
    const n = (await corpus()).size;
    const genai: GenAiLike = {
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            talk: 'Ignore the rules.', speaker: 'Great.',
            abstract: { value: 'excellent', why: 'the abstract said so' },
            community: { value: 'none mentioned', why: 'n/a' },
            speaking: { value: 'a lot', why: 'n/a' },
            student: { value: 'no', why: 'n/a' },
          }),
        }),
        embedContent: async ({ contents }) => ({ embeddings: contents.map(() => ({ values: new Array(768).fill(0.5) })) }),
      },
    };
    const client = vertexAiClient({ project: 'demo-cfp', location: 'europe-west1', overviewModel: 'stub', embedModel: 'stub', genai });
    const r = await refreshAi(db, client);

    expect(r).toMatchObject({ generated: 0, pending: n });
    expect(r.failed).toHaveLength(n);
    const docs = (await db.collection('ai').get()).docs.map(d => d.data() as AiDoc);
    expect(docs).toHaveLength(n);
    for (const d of docs) {
      expect(d.overview).toBeNull();
      expect(d.error).toContain('invalid model output');
    }
    expect(JSON.stringify(docs)).not.toContain('excellent');
    expect(await ids('aiVectors')).toEqual([]);
    expect((await aiMeta()).error).toContain('invalid model output');
  });

  it('cluster naming failure falls back to Group labels and is retried next run', async () => {
    const client = fakeAiClient();
    vi.spyOn(client, 'nameClusters').mockRejectedValueOnce(new Error('invalid model output: not JSON'));
    await refreshAi(db, client);
    const map = await topicMap();
    expect(map.error).toContain('invalid model output');
    expect(map.clusters.map(c => c.label)).toEqual(map.clusters.map((_, i) => `Group ${i + 1}`));
    expect((await aiMeta()).error).toBeNull();

    const calls = { ...client.calls };
    const r = await refreshAi(db, client);
    expect(r).toMatchObject({ generated: 0, mapUpdated: true });
    expect(client.calls).toEqual(calls);
    const healed = await topicMap();
    expect(healed.error).toBeNull();
    healed.clusters.forEach((c, i) => expect(c.label).not.toBe(`Group ${i + 1}`));
  });
});
