import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { AiOverview } from '../model.js';
import { OVERVIEW_SYSTEM, OVERVIEW_SCHEMA, OVERVIEW_LIMITS, CLUSTER_SYSTEM, CLUSTER_SCHEMA } from './prompt.js';
import { escapeAngles } from './inputs.js';

/** Overviews and cluster names. Vertex serves it only on `global` or the `us`/`eu` multi-regions; we use `eu`. */
export const OVERVIEW_MODEL = 'gemini-3.8-flash';
export const EMBED_MODEL = 'gemini-embedding-001';
export const EMBED_DIMS = 768;
/** Texts per embedContent request. Vertex gemini-embedding-001 accepts one input per request; raise only if that changes. */
export const EMBED_BATCH = 1;
/** Output token caps. The overview's capped fields need well under 1,000 tokens; the rest is room for thinking. */
export const OVERVIEW_MAX_TOKENS = 2048;
/** At most 10 labels of a few words each. */
export const CLUSTER_MAX_TOKENS = 512;
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
        maxOutputTokens?: number; thinkingConfig?: ThinkingConfig; httpOptions?: { timeout?: number };
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
/** Non-blank and at most `max` characters, counted like JSON Schema's maxLength (code points). */
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim() !== '' && [...v].length <= max;
const flagOk = (v: unknown, allowed?: string[], maxValue = Infinity) =>
  isObj(v) && text(v.why, OVERVIEW_LIMITS.why) && text(v.value, maxValue) && (!allowed || allowed.includes(v.value));

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
    !isObj(v) || !text(v.talk, OVERVIEW_LIMITS.summary) || !text(v.speaker, OVERVIEW_LIMITS.summary) ||
    !flagOk(v.abstract, ABSTRACT) || !flagOk(v.community, undefined, OVERVIEW_LIMITS.community) ||
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
          maxOutputTokens: OVERVIEW_MAX_TOKENS, thinkingConfig, httpOptions,
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
          maxOutputTokens: CLUSTER_MAX_TOKENS, thinkingConfig, httpOptions,
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
