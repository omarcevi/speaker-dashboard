import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { AiOverview } from '../model';
import { OVERVIEW_SYSTEM, OVERVIEW_SCHEMA, CLUSTER_SYSTEM, CLUSTER_SCHEMA } from './prompt';
import { escapeAngles } from './inputs';

/** Overviews and cluster names. Vertex serves it only on `global` or the `us`/`eu` multi-regions; we use `eu`. */
export const OVERVIEW_MODEL = 'gemini-3.8-flash';
export const EMBED_MODEL = 'gemini-embedding-001';
export const EMBED_DIMS = 768;
/** Texts per embedContent request. Vertex gemini-embedding-001 accepts one input per request; raise only if that changes. */
export const EMBED_BATCH = 1;
/** Per-request deadline. The SDK aborts the request when it runs out, and the call rejects like any other failure. */
export const AI_TIMEOUT_MS = 60_000;

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
      config?: {
        systemInstruction?: string; responseMimeType?: string; responseJsonSchema?: unknown;
        thinkingConfig?: ThinkingConfig; httpOptions?: { timeout?: number };
      };
    }): Promise<{ text?: string }>;
    embedContent(p: {
      model: string;
      contents: string[];
      config?: { outputDimensionality?: number; taskType?: string; httpOptions?: { timeout?: number } };
    }): Promise<{ embeddings?: { values?: number[] }[] }>;
  };
}

const ABSTRACT = ['clear', 'vague', 'sales pitch'];
const SPEAKING = ['none', 'minimal', 'some', 'a lot'];
const STUDENT = ['yes', 'no', 'unclear'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const flagOk = (v: unknown, allowed?: string[]) =>
  isObj(v) && typeof v.why === 'string' && v.why.trim() !== '' && typeof v.value === 'string' && v.value.trim() !== '' && (!allowed || allowed.includes(v.value));

function parseJson(text: string | undefined): unknown {
  try { return JSON.parse(text ?? ''); } catch { throw new Error('invalid model output: not JSON'); }
}

const LABEL_RE = /^[\p{L}\p{N} &\/\-,.']+$/u;
function safeLabel(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const words = t.split(/ +/).length;
  return t.length >= 1 && t.length <= 40 && words <= 5 && LABEL_RE.test(t) ? t : null;
}

export function validateOverview(v: unknown): OverviewFields {
  if (
    !isObj(v) || typeof v.talk !== 'string' || !v.talk.trim() || typeof v.speaker !== 'string' || !v.speaker.trim() ||
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

/**
 * Vertex AI in this project, inside the EU only. The location types are literals, so `global` can't be passed.
 * Two SDK clients: generation on the `eu` multi-region (aiplatform.eu.rep.googleapis.com), embeddings in `europe-west1`.
 */
export function vertexAiClient(opts: {
  project: string;
  generationLocation: 'eu';
  embedLocation: 'europe-west1';
  overviewModel: string;
  embedModel: string;
  /** Test stubs. A missing one is a real Vertex client. */
  genai?: { generation?: GenAiLike; embed?: GenAiLike };
  timeoutMs?: number;
}): AiClient {
  const vertex = (location: string) => new GoogleGenAI({ vertexai: true, project: opts.project, location }) as unknown as GenAiLike;
  const generation = opts.genai?.generation ?? vertex(opts.generationLocation);
  const embedder = opts.genai?.embed ?? vertex(opts.embedLocation);
  const httpOptions = { timeout: opts.timeoutMs ?? AI_TIMEOUT_MS };
  // Gemini 3: keep the default temperature; low thinking cuts latency and cost for these short structured answers.
  const thinkingConfig: ThinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  return {
    async overview(input) {
      const res = await generation.models.generateContent({
        model: opts.overviewModel,
        contents: input,
        config: {
          systemInstruction: OVERVIEW_SYSTEM, responseMimeType: 'application/json', responseJsonSchema: OVERVIEW_SCHEMA,
          thinkingConfig, httpOptions,
        },
      });
      return { fields: validateOverview(parseJson(res.text)), model: opts.overviewModel };
    },
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const chunk = texts.slice(i, i + EMBED_BATCH);
        const res = await embedder.models.embedContent({
          model: opts.embedModel,
          contents: chunk,
          config: { outputDimensionality: EMBED_DIMS, taskType: 'SEMANTIC_SIMILARITY', httpOptions },
        });
        const vecs = res.embeddings ?? [];
        if (vecs.length !== chunk.length || vecs.some((e) => !Array.isArray(e.values) || e.values.length !== EMBED_DIMS)) {
          throw new Error('invalid embedding response');
        }
        for (const e of vecs) out.push(e.values as number[]);
      }
      return out;
    },
    async nameClusters(groups) {
      const prompt = groups
        .map((g, id) => `Group ${id}:\n${g.map((t) => `<title>${escapeAngles(t).replace(/\s*[\r\n]+\s*/g, ' ')}</title>`).join('\n')}`)
        .join('\n\n');
      const res = await generation.models.generateContent({
        model: opts.overviewModel,
        contents: prompt,
        config: {
          systemInstruction: CLUSTER_SYSTEM, responseMimeType: 'application/json', responseJsonSchema: CLUSTER_SCHEMA,
          thinkingConfig, httpOptions,
        },
      });
      const parsed = parseJson(res.text); // throws only if not JSON at all
      const entries = isObj(parsed) && Array.isArray(parsed.labels) ? parsed.labels : [];
      const byId = new Map<number, string | null>();
      for (const l of entries) {
        if (!isObj(l) || !Number.isInteger(l.id)) continue;
        const id = l.id as number;
        if (id < 0 || id >= groups.length) continue;
        if (byId.has(id)) { byId.set(id, null); continue; } // duplicate id: distrust both
        byId.set(id, safeLabel(l.label));
      }
      return groups.map((_, id) => byId.get(id) ?? `Group ${id + 1}`);
    },
  };
}
