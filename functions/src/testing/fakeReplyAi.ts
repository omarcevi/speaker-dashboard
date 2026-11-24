import type { ReplyAi, DecisionResult } from '../ai/replyAi.js';

const dist = (label: string, p: number): DecisionResult['probabilities'] => {
  const rest = (1 - p) / 3;
  const out = { needs_answer: rest, no_answer_needed: rest, withdrawing: rest, unclear: rest } as DecisionResult['probabilities'];
  out[label as keyof typeof out] = p;
  return out;
};

export function fakeReplyAi(opts: { fail?: Set<string> } = {}): ReplyAi & { calls: { decide: number; draft: number } } {
  const calls = { decide: 0, draft: 0 };
  const check = (s: string) => {
    for (const f of opts.fail ?? []) if (s.includes(f)) throw new Error('fake ai failure');
  };
  return {
    calls,
    async decide(input) {
      calls.decide++;
      check(input.reply);
      const t = input.reply.toLowerCase();
      let probabilities;
      let confidence;
      if (t.includes('withdraw')) { probabilities = dist('withdrawing', 0.9); confidence = 0.9; }
      else if (t.includes('thanks') || t.includes('teşekkür')) { probabilities = dist('no_answer_needed', 0.97); confidence = 0.97; }
      else if (t.includes('?')) { probabilities = dist('needs_answer', 0.9); confidence = 0.9; }
      else { probabilities = dist('unclear', 0.7); confidence = 0.7; }
      return { probabilities, confidence, model: 'fake-decision' };
    },
    async draft(input) {
      calls.draft++;
      check(input.facts);
      for (const m of input.conversation) check(m.text);
      return { text: `Hi ${input.speaker.firstName}, [fake draft]`, model: 'fake-draft' };
    },
  };
}
