import { describe, it, expect, vi } from 'vitest';
import { liveReplyAi, DECISION_MODEL, DRAFT_MODEL, DRAFT_MAX_TOKENS } from '../src/ai/replyAi';
import { decisionText, draftPrompt, DRAFT_SYSTEM } from '../src/ai/replyPrompt';
import { fakeReplyAi } from '../src/testing/fakeReplyAi';
import type { GenAiLike } from '../src/ai/client';

const probs = { needs_answer: 0.7, no_answer_needed: 0.2, withdrawing: 0.05, unclear: 0.05 };
const ok = (answers: any) => new Response(JSON.stringify({ answers }), { status: 200 });
const okProbs = (p: any = probs, c: any = 0.8) => ok({ action: { type: 'choice', choice: 'needs_answer', probabilities: p, confidence: c } });
const input = { reply: 'Hi there?', quoted: '', previousTeam: null, earlier: [] };

function mk(fetchFn: any, genai?: GenAiLike) {
  return liveReplyAi({ apiKey: 'k', project: 'p', fetchFn, genai: genai ?? ({ models: {} } as any) });
}

describe('decide', () => {
  it('posts to the decisions endpoint and parses probabilities', async () => {
    const f = vi.fn(async () => okProbs());
    const r = await mk(f).decide(input);
    expect(r).toEqual({ probabilities: probs, confidence: 0.8, model: DECISION_MODEL });
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(init.method).toBe('POST');
    expect(init.headers['x-goog-api-key']).toBe('k');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gemini-decision-1');
    expect(body.input).toBe(decisionText(input));
    expect(body.questions.action.type).toBe('choice');
    expect(body.questions.action.instructions).toContain('DevFest Istanbul speaker team');
    expect(Object.keys(body.questions.action.criteria)).toEqual(['needs_answer', 'no_answer_needed', 'withdrawing', 'unclear']);
  });
  it.each([
    ['missing label', { needs_answer: 0.5, no_answer_needed: 0.5, withdrawing: 0 }],
    ['non-number', { ...probs, unclear: '0.05' }],
    ['sum off', { needs_answer: 0.5, no_answer_needed: 0.2, withdrawing: 0.05, unclear: 0.05 }],
  ])('rejects %s', async (_n, p) => {
    await expect(mk(async () => okProbs(p)).decide(input)).rejects.toThrow('invalid decision output');
  });
  it('rejects a non-number confidence', async () => {
    await expect(mk(async () => okProbs(probs, 'x')).decide(input)).rejects.toThrow('invalid decision output');
  });
  it('reports http status and error code only', async () => {
    const f = async () => new Response(JSON.stringify({ error: { code: 'safety', message: 'secret speaker text' } }), { status: 400 });
    const e = await mk(f).decide(input).catch((x) => x);
    expect(e.message).toContain('http 400 safety');
    expect(e.message).not.toContain('secret');
  });
  it('drops a malformed error code', async () => {
    const f = async () => new Response(JSON.stringify({ error: { code: 'Bad code with text!' } }), { status: 500 });
    const e = await mk(f).decide(input).catch((x) => x);
    expect(e.message).toBe('decisions failed: http 500');
  });
});

describe('decisionText', () => {
  it('puts the unquoted reply first, caps and escapes', () => {
    const t = decisionText({ reply: '<b>hi</b>' + 'x'.repeat(9000), quoted: 'old', previousTeam: { subject: 'S<', text: 'y'.repeat(5000) }, earlier: [] });
    expect(t.startsWith('&lt;b&gt;hi')).toBe(true);
    expect(t).not.toContain('<b>');
    expect(t.match(/x/g)!.length).toBeLessThanOrEqual(8000);
    expect(t.match(/y/g)!.length).toBe(4000);
    expect(t).toContain('S&lt;');
    expect(t).not.toContain('old');
  });
  it('uses the first 2000 chars of quoted when reply is blank', () => {
    const t = decisionText({ reply: '  ', quoted: 'q'.repeat(3000), previousTeam: null, earlier: [] });
    expect(t.match(/q/g)!.length).toBe(2000);
  });
  it('puts earlier unanswered speaker messages, oldest first and labelled, before the newest reply', () => {
    const t = decisionText({ reply: 'NEWEST thanks', quoted: '', previousTeam: null, earlier: ['FIRST <q>?', 'SECOND'] });
    expect(t).toMatch(/earlier unanswered messages from the speaker/i);
    expect(t.indexOf('FIRST')).toBeLessThan(t.indexOf('SECOND'));
    expect(t.indexOf('SECOND')).toBeLessThan(t.indexOf('NEWEST'));
    expect(t).toContain('&lt;q&gt;');
    expect(t).toMatch(/newest message from the speaker/i);
  });
  it('caps each earlier message at 2000 chars and all of them at 6000, keeping the newest', () => {
    const earlier = ['①' + '1'.repeat(2999), '②' + '2'.repeat(2999), '③' + '3'.repeat(2999), '④' + '4'.repeat(2999)];
    const t = decisionText({ reply: 'hi', quoted: '', previousTeam: null, earlier });
    expect(t.match(/4/g)!.length).toBe(1999);
    for (const m of ['②', '③', '④']) expect(t).toContain(m);
    expect(t).not.toContain('①');
    expect(t.indexOf('②')).toBeLessThan(t.indexOf('④'));
  });
});

describe('draftPrompt', () => {
  const base = {
    facts: 'FACTS-X', eventFields: [{ label: 'Venue', value: 'Hall 5' }], templates: [{ name: 'TplName', text: 'body' }],
    speaker: { firstName: 'Ada', talkTitles: ['Talk One'] }, conversation: [] as any[],
  };
  it('includes everything oldest to newest', () => {
    const p = draftPrompt({ ...base, conversation: [{ from: 'team', at: 1, text: 'FIRST' }, { from: 'speaker', at: 2, text: 'SECOND' }] });
    for (const s of ['FACTS-X', 'Venue', 'Hall 5', 'TplName', 'Talk One', 'Ada']) expect(p).toContain(s);
    expect(p.indexOf('FIRST')).toBeLessThan(p.indexOf('SECOND'));
  });
  it('keeps the newest messages when over 30000 chars', () => {
    const conversation = Array.from({ length: 10 }, (_, i) => ({ from: 'speaker' as const, at: i, text: `M${i}` + 'z'.repeat(4000) }));
    const p = draftPrompt({ ...base, conversation });
    expect(p).toContain('M9');
    expect(p).not.toContain('M0');
  });
});

describe('draft', () => {
  const dInput = { facts: 'f', eventFields: [], templates: [], speaker: { firstName: 'A', talkTitles: [] }, conversation: [] };
  const gen = (text: string | undefined) => {
    const calls: any[] = [];
    return { calls, genai: { models: { generateContent: async (r: any) => { calls.push(r); return { text }; } } } as any };
  };
  it('calls generateContent with the draft model and system prompt', async () => {
    const g = gen('  hello  ');
    const r = await mk(vi.fn(), g.genai).draft(dInput);
    expect(r).toEqual({ text: 'hello', model: DRAFT_MODEL });
    expect(g.calls[0].model).toBe('gemini-3.8-flash');
    expect(g.calls[0].config.systemInstruction).toBe(DRAFT_SYSTEM);
    expect(g.calls[0].config.maxOutputTokens).toBe(DRAFT_MAX_TOKENS);
    expect(DRAFT_SYSTEM).toMatch(/bracket/);
  });
  it('rejects blank output', async () => {
    await expect(mk(vi.fn(), gen('  ').genai).draft(dInput)).rejects.toThrow('invalid draft output');
    await expect(mk(vi.fn(), gen(undefined).genai).draft(dInput)).rejects.toThrow('invalid draft output');
  });
  it('caps output at 10000 chars', async () => {
    const r = await mk(vi.fn(), gen('a'.repeat(12000)).genai).draft(dInput);
    expect(r.text.length).toBe(10000);
  });
});

describe('fakeReplyAi', () => {
  const d = (reply: string) => fakeReplyAi().decide({ reply, quoted: '', previousTeam: null, earlier: [] });
  it('classifies by keyword', async () => {
    expect((await d('I must withdraw')).probabilities.withdrawing).toBe(0.9);
    expect((await d('Thanks!')).probabilities.no_answer_needed).toBe(0.97);
    expect((await d('teşekkür ederim')).probabilities.no_answer_needed).toBe(0.97);
    expect((await d('when?')).probabilities.needs_answer).toBe(0.9);
    expect((await d('ok')).probabilities.unclear).toBe(0.7);
  });
  it('counts calls and fails on substring', async () => {
    const f = fakeReplyAi({ fail: new Set(['BOOM']) });
    await expect(f.decide({ reply: 'BOOM', quoted: '', previousTeam: null, earlier: [] })).rejects.toThrow();
    await expect(f.draft({ facts: 'BOOM', eventFields: [], templates: [], speaker: { firstName: 'a', talkTitles: [] }, conversation: [] })).rejects.toThrow();
    expect(f.calls).toEqual({ decide: 1, draft: 1 });
    expect((await f.draft({ facts: '', eventFields: [], templates: [], speaker: { firstName: 'a', talkTitles: [] }, conversation: [] })).text).toBeTruthy();
  });
});
