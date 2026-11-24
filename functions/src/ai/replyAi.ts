import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { ReplyLabel } from '../model.js';
import { REPLY_LABELS } from '../shared/replyAi.js';
import { AI_TIMEOUT_MS, type GenAiLike } from './client.js';
import {
  decisionText, draftPrompt, DRAFT_SYSTEM, DECISION_INSTRUCTIONS, DECISION_CRITERIA,
  type DecisionInput, type DraftInput,
} from './replyPrompt.js';

export type { DecisionInput, DraftInput };

export const DECISION_MODEL = 'gemini-decision-1';
export const DRAFT_MODEL = 'gemini-3.8-flash';
export const DRAFT_MAX_TOKENS = 2048;
export const DRAFT_OUTPUT_CAP = 10_000;
export const DECISIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/decisions';

export interface DecisionResult { probabilities: Record<ReplyLabel, number>; confidence: number; model: string }
export interface ReplyAi {
  decide(input: DecisionInput): Promise<DecisionResult>;
  draft(input: DraftInput): Promise<{ text: string; model: string }>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function liveReplyAi(opts: {
  apiKey: string; project: string; fetchFn?: typeof fetch; genai?: GenAiLike; timeoutMs?: number;
}): ReplyAi {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeout = opts.timeoutMs ?? AI_TIMEOUT_MS;
  const genai = opts.genai ?? (new GoogleGenAI({ vertexai: true, project: opts.project, location: 'eu' }) as unknown as GenAiLike);
  const thinkingConfig: ThinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  return {
    async decide(input) {
      const res = await fetchFn(DECISIONS_URL, {
        method: 'POST',
        headers: { 'x-goog-api-key': opts.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DECISION_MODEL,
          input: decisionText(input),
          questions: { action: { type: 'choice', instructions: DECISION_INSTRUCTIONS, criteria: DECISION_CRITERIA } },
        }),
        signal: AbortSignal.timeout(timeout),
      });
      let json: unknown = null;
      try { json = await res.json(); } catch { /* body is not JSON */ }
      if (!res.ok) {
        // Never echo response text: only the status and a short code token.
        const code = isObj(json) && isObj(json.error) ? json.error.code : undefined;
        const safe = typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? ` ${code}` : '';
        throw new Error(`decisions failed: http ${res.status}${safe}`);
      }
      const a = isObj(json) && isObj(json.answers) && isObj(json.answers.action) ? json.answers.action : null;
      const p = a && isObj(a.probabilities) ? a.probabilities : null;
      const probabilities = {} as Record<ReplyLabel, number>;
      let sum = 0;
      for (const l of REPLY_LABELS) {
        const v = p?.[l];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw new Error('invalid decision output');
        probabilities[l] = v;
        sum += v;
      }
      if (Math.abs(sum - 1) > 0.02) throw new Error('invalid decision output');
      const confidence = a?.confidence;
      if (typeof confidence !== 'number' || !Number.isFinite(confidence)) throw new Error('invalid decision output');
      return { probabilities, confidence, model: DECISION_MODEL };
    },
    async draft(input) {
      const res = await genai.models.generateContent({
        model: DRAFT_MODEL,
        contents: draftPrompt(input),
        config: {
          systemInstruction: DRAFT_SYSTEM, maxOutputTokens: DRAFT_MAX_TOKENS, thinkingConfig,
          httpOptions: { timeout },
        },
      });
      const text = (res.text ?? '').trim().slice(0, DRAFT_OUTPUT_CAP).trim();
      if (!text) throw new Error('invalid draft output');
      return { text, model: DRAFT_MODEL };
    },
  };
}
