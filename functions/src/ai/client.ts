import { GoogleGenAI } from '@google/genai';
import type { AiOverview } from '../model';
import { OVERVIEW_SYSTEM, OVERVIEW_SCHEMA, CLUSTER_SYSTEM } from './prompt';

export const OVERVIEW_MODEL = 'gemini-2.5-flash';
export const EMBED_MODEL = 'gemini-embedding-001';
export const EMBED_DIMS = 768;
/** Texts per embedContent request (conservative cap). */
export const EMBED_BATCH = 100;

export type OverviewFields = Omit<AiOverview, 'model' | 'generatedAt'>;

export interface AiClient {
  overview(input: string): Promise<{ fields: OverviewFields; model: string }>;
  embed(texts: string[]): Promise<number[][]>;
  nameClusters(groups: string[][]): Promise<string[]>;
}

/** Minimal structural subset of GoogleGenAI that we call. */
export interface GenAiLike {
  models: {
    generateContent(p: {
      model: string;
      contents: string;
      config?: { systemInstruction?: string; responseMimeType?: string; responseJsonSchema?: unknown };
    }): Promise<{ text?: string }>;
    embedContent(p: {
      model: string;
      contents: string[];
      config?: { outputDimensionality?: number; taskType?: string };
    }): Promise<{ embeddings?: { values?: number[] }[] }>;
  };
}

const ABSTRACT = ['clear', 'vague', 'sales pitch'];
const SPEAKING = ['none', 'minimal', 'some', 'a lot'];
const STUDENT = ['yes', 'no', 'unclear'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const flagOk = (v: unknown, allowed?: string[]) =>
  isObj(v) && typeof v.why === 'string' && typeof v.value === 'string' && (!allowed || allowed.includes(v.value));

function parseJson(text: string | undefined): unknown {
  try { return JSON.parse(text ?? ''); } catch { throw new Error('invalid model output: not JSON'); }
}

export function validateOverview(v: unknown): OverviewFields {
  if (
    !isObj(v) || typeof v.talk !== 'string' || typeof v.speaker !== 'string' ||
    !flagOk(v.abstract, ABSTRACT) || !flagOk(v.community) ||
    !flagOk(v.speaking, SPEAKING) || !flagOk(v.student, STUDENT)
  ) throw new Error('invalid model output: overview failed validation');
  const f = v as unknown as OverviewFields;
  return {
    talk: f.talk, speaker: f.speaker,
    abstract: { value: f.abstract.value, why: f.abstract.why },
    community: { value: f.community.value, why: f.community.why },
    speaking: { value: f.speaking.value, why: f.speaking.why },
    student: { value: f.student.value, why: f.student.why },
  };
}

export function vertexAiClient(opts: {
  project: string; location: 'europe-west1'; overviewModel: string; embedModel: string; genai?: GenAiLike;
}): AiClient {
  const genai: GenAiLike = opts.genai ?? (new GoogleGenAI({ vertexai: true, project: opts.project, location: opts.location }) as unknown as GenAiLike);
  return {
    async overview(input) {
      const res = await genai.models.generateContent({
        model: opts.overviewModel,
        contents: input,
        config: { systemInstruction: OVERVIEW_SYSTEM, responseMimeType: 'application/json', responseJsonSchema: OVERVIEW_SCHEMA },
      });
      return { fields: validateOverview(parseJson(res.text)), model: opts.overviewModel };
    },
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const chunk = texts.slice(i, i + EMBED_BATCH);
        const res = await genai.models.embedContent({
          model: opts.embedModel,
          contents: chunk,
          config: { outputDimensionality: EMBED_DIMS, taskType: 'SEMANTIC_SIMILARITY' },
        });
        const vecs = res.embeddings ?? [];
        if (vecs.length !== chunk.length || vecs.some((e) => !Array.isArray(e.values) || e.values.length === 0)) {
          throw new Error('invalid embedding response');
        }
        for (const e of vecs) out.push(e.values as number[]);
      }
      return out;
    },
    async nameClusters(groups) {
      const prompt = groups.map((g, id) => `Group ${id}:\n${g.map((t) => `- ${t}`).join('\n')}`).join('\n\n');
      const res = await genai.models.generateContent({
        model: opts.overviewModel,
        contents: prompt,
        config: { systemInstruction: CLUSTER_SYSTEM, responseMimeType: 'application/json' },
      });
      const parsed = parseJson(res.text);
      const labels = isObj(parsed) && Array.isArray(parsed.labels) ? parsed.labels : null;
      if (!labels) throw new Error('invalid model output: no labels');
      const byId = new Map<number, string>();
      for (const l of labels) {
        if (isObj(l) && typeof l.id === 'number' && typeof l.label === 'string' && l.label.trim()) byId.set(l.id, l.label.trim());
      }
      return groups.map((_, id) => {
        const label = byId.get(id);
        if (!label) throw new Error('invalid model output: missing label');
        return label;
      });
    },
  };
}
