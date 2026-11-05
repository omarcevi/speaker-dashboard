import type { AiClient, OverviewFields } from '../ai/client';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// `>>> 0`: callers pass signed shifts of an unsigned hash, which can be negative.
const pick = <T>(arr: T[], h: number) => arr[(h >>> 0) % arr.length];

export function fakeAiClient(opts: { fail?: Set<string> } = {}): AiClient & { calls: { overview: number; embed: number } } {
  const calls = { overview: 0, embed: 0 };
  const check = (s: string) => {
    for (const f of opts.fail ?? []) if (s.includes(f)) throw new Error('fake ai failure');
  };
  return {
    calls,
    async overview(input) {
      calls.overview++;
      check(input);
      const h = hash(input);
      const fields: OverviewFields = {
        talk: `Fake talk summary ${h % 1000}`,
        speaker: `Fake speaker summary ${h % 997}`,
        abstract: { value: pick(['clear', 'vague', 'sales pitch'] as const, h), why: 'fake' },
        community: { value: pick(['none mentioned', 'GDG', 'Women Techmakers'], h >> 3), why: 'fake' },
        speaking: { value: pick(['none', 'minimal', 'some', 'a lot'] as const, h >> 5), why: 'fake' },
        student: { value: pick(['yes', 'no', 'unclear'] as const, h >> 7), why: 'fake' },
      };
      return { fields, model: 'fake-overview' };
    },
    async embed(texts) {
      calls.embed++;
      texts.forEach(check);
      return texts.map((t) => {
        let x = hash(t) || 1;
        return Array.from({ length: 768 }, () => {
          x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
          return x / 4294967296 - 0.5;
        });
      });
    },
    async nameClusters(groups) {
      return groups.map((g, i) => `Topic ${i + 1}: ${(g[0] ?? '').slice(0, 20)}`.trim());
    },
  };
}
