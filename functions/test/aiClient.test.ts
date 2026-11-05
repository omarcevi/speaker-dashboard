import { describe, it, expect } from 'vitest';
import { vertexAiClient, OVERVIEW_MODEL, EMBED_MODEL, type GenAiLike } from '../src/ai/client';
import { fakeAiClient } from '../src/testing/fakeAiClient';
import { OVERVIEW_SCHEMA, OVERVIEW_SYSTEM } from '../src/ai/prompt';

const good = {
  talk: 't', speaker: 's',
  abstract: { value: 'clear', why: 'w' }, community: { value: 'GDG', why: 'w' },
  speaking: { value: 'some', why: 'w' }, student: { value: 'no', why: 'w' },
};

function stub(text: string) {
  const gen: any[] = [], emb: any[] = [];
  const genai: GenAiLike = {
    models: {
      generateContent: async (r: any) => { gen.push(r); return { text } as any; },
      embedContent: async (r: any) => { emb.push(r); return { embeddings: (r.contents as string[]).map(() => ({ values: [0.1, 0.2] })) } as any; },
    },
  };
  return { genai, gen, emb };
}
const mk = (genai: GenAiLike) => vertexAiClient({ project: 'p', location: 'europe-west1', overviewModel: OVERVIEW_MODEL, embedModel: EMBED_MODEL, genai });

describe('vertexAiClient', () => {
  it('overview call uses JSON schema and the system prompt', async () => {
    const s = stub(JSON.stringify(good));
    const r = await mk(s.genai).overview('<submission>x</submission>');
    expect(r.fields).toEqual(good);
    expect(r.model).toBe(OVERVIEW_MODEL);
    const req = s.gen[0];
    expect(req.model).toBe(OVERVIEW_MODEL);
    expect(req.config.responseMimeType).toBe('application/json');
    expect(req.config.responseJsonSchema).toBe(OVERVIEW_SCHEMA);
    expect(req.config.systemInstruction).toBe(OVERVIEW_SYSTEM);
  });
  it('embed asks for 768 dims SEMANTIC_SIMILARITY', async () => {
    const s = stub('');
    const out = await mk(s.genai).embed(['a', 'b']);
    expect(out).toEqual([[0.1, 0.2], [0.1, 0.2]]);
    expect(s.emb[0].model).toBe(EMBED_MODEL);
    expect(s.emb[0].config.outputDimensionality).toBe(768);
    expect(s.emb[0].config.taskType).toBe('SEMANTIC_SIMILARITY');
  });
  it('embed splits large batches and keeps order', async () => {
    const s = stub('');
    const out = await mk(s.genai).embed(Array.from({ length: 250 }, (_, i) => String(i)));
    expect(out).toHaveLength(250);
    expect(s.emb.map((r) => r.contents.length)).toEqual([100, 100, 50]);
  });
  it('invalid model output is rejected, not returned', async () => {
    const bad = { ...good, abstract: { value: 'excellent', why: 'w' } };
    await expect(mk(stub(JSON.stringify(bad)).genai).overview('x')).rejects.toThrow(/invalid/);
    await expect(mk(stub('not json').genai).overview('x')).rejects.toThrow(/invalid/);
    const { talk, ...missing } = good;
    await expect(mk(stub(JSON.stringify(missing)).genai).overview('x')).rejects.toThrow(/invalid/);
    await expect(mk(stub(JSON.stringify({ ...good, community: { value: 3, why: 'w' } })).genai).overview('x')).rejects.toThrow(/invalid/);
  });
  it('nameClusters returns labels in group order', async () => {
    const s = stub(JSON.stringify({ labels: [{ id: 1, label: 'B' }, { id: 0, label: 'A' }] }));
    expect(await mk(s.genai).nameClusters([['x'], ['y']])).toEqual(['A', 'B']);
    await expect(mk(stub('{"labels":[]}').genai).nameClusters([['x']])).rejects.toThrow(/invalid/);
  });
});

describe('fakeAiClient', () => {
  it('is deterministic and can fail on demand', async () => {
    const f = fakeAiClient({ fail: new Set(['boom']) });
    const a = await f.overview('hello'), b = await f.overview('hello');
    expect(a).toEqual(b);
    const [e1] = await f.embed(['hello']); const [e2] = await f.embed(['hello']);
    expect(e1).toHaveLength(768);
    expect(e1).toEqual(e2);
    expect(await f.nameClusters([['a'], ['b']])).toHaveLength(2);
    await expect(f.overview('a boom b')).rejects.toThrow();
    await expect(f.embed(['boom'])).rejects.toThrow();
    expect(f.calls.overview).toBe(3);
    expect(f.calls.embed).toBe(3);
  });
});
