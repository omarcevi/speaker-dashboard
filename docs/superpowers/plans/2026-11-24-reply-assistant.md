# AI Reply Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new speaker reply gets a Gemini Decisions API reading (needs answer / no answer needed / withdrawing /
unclear); very sure "no answer needed" replies clear automatically with Undo; replies that need an answer get a Gemini
draft in the conversation sheet; admins edit "Speaker facts" that drafts read.

**Architecture:** A Firestore trigger on new `threads/{t}/messages/{m}` replies calls `assistReply`, which asks the
Decisions API (REST, API key) and, when needed, Vertex Gemini for a draft, then writes `ai` / `draft` / `settled` on the
thread doc in a transaction guarded by `lastReplyId`. The web app's single follow-up rule (`speakerWroteLast`) learns
about `settled`, so Emails, Stages and counts follow automatically.

**Tech Stack:** Firebase Functions v2 (europe-west1, Node 22), Firestore, `fetch` for the Decisions API, `@google/genai`
(Vertex, existing) for drafts, React 19 + Vite, Vitest, rules-unit-testing.

**Spec:** `docs/superpowers/specs/2026-11-24-reply-assistant-design.md`

## Global Constraints

- Decision model `gemini-decision-1`, endpoint `POST https://generativelanguage.googleapis.com/v1beta/decisions`, header
  `x-goog-api-key`, key from Firebase secret `GEMINI_API_KEY`. No SDK upgrade (stays `@google/genai` ^2.32 for Vertex).
- Choice options exactly: `needs_answer`, `no_answer_needed`, `withdrawing`, `unclear`.
- Auto-clear when `no_answer_needed >= 0.95` and `withdrawing < 0.10`. Withdrawing warning when `withdrawing >= 0.30`.
- Draft only when top label is `needs_answer` or `unclear` and not auto-cleared. Drafts: Vertex `gemini-3.8-flash` on
  `eu`, plain text, speaker's language (English or Turkish), no signature, unknown facts as `[...]` gaps.
- Drafts read only: Speaker facts, Event settings fields, template texts, speaker name + talk title(s), this
  conversation. Never other threads.
- Any AI failure leaves the reply flagged exactly as today (no `settled` written). Logs hold counts/ids/error codes
  only, never reply text.
- `meta/event.speakerFacts`: plain string, ≤ 20,000 characters. `settled` writable by admins (own uid/name) or functions;
  `ai` and `draft` only by functions.
- No backfill: only replies created after deploy are assessed.
- Emulator uses fakes for both AI calls, never Google.
- UI copy: "AI: needs an answer · 92%", "AI: no reply needed · cleared", "AI: may be withdrawing", buttons
  "No reply needed", "Undo", "Draft a reply", "Redraft", filter "Cleared by AI". Follows DESIGN.md.
- Never add Claude as author/co-author in commits.

## Review Focus

1. A newer reply arrives while the older one is being assessed → the older result must not be written (or must not
   apply): `ai`, `draft`, `settled` only count when their `messageId === lastReplyId`. Test in Task 4.
2. Team answers after an auto-clear, then the speaker writes again → flagged again (new messageId). Test in Task 5.
3. Decisions API returns 400 (safety block) or the key is missing → reply stays flagged, `ai` records `error`, no throw
   loop. Test in Task 4.
4. A reply in Turkish, or a reply that is only quoted text with an empty unquoted part → still assessed (input falls
   back to the first 2,000 chars of quoted text). Test in Task 2.
5. Admin presses Send on a draft still containing `[...]` → in-page confirm, not a browser dialog. Test in Task 7.

---

### Task 1: Shared types and reading rules

**Files:**
- Modify: `functions/src/model.ts` (ThreadDoc, EventSettings)
- Create: `functions/src/shared/replyAi.ts`
- Test: `functions/test/replyAi.test.ts`

**Interfaces:**
- Produces (model.ts):
  - `type ReplyLabel = 'needs_answer' | 'no_answer_needed' | 'withdrawing' | 'unclear'`
  - `interface ReplyReading { messageId: string; label: ReplyLabel | null; probabilities: Record<ReplyLabel, number> | null; confidence: number | null; model: string; at: Ts; error: string | null }`
  - `interface ReplyDraft { messageId: string; text: string; model: string; at: Ts }`
  - `interface ReplySettled { messageId: string; by: string /* 'ai' or uid */; byName: string; at: Ts }`
  - `ThreadDoc` gains optional `lastReplyId?: string; ai?: ReplyReading; draft?: ReplyDraft; settled?: ReplySettled | null; drafting?: Ts | null`
  - `EventSettings` gains optional `speakerFacts?: string`
- Produces (shared/replyAi.ts):
  - `AUTO_CLEAR = 0.95`, `WITHDRAW_BLOCK = 0.10`, `WITHDRAW_WARN = 0.30`, `REPLY_LABELS: ReplyLabel[]`
  - `topLabel(p: Record<ReplyLabel, number>): ReplyLabel`
  - `autoClears(p): boolean`, `mayWithdraw(p): boolean`, `wantsDraft(p): boolean`
  - `currentFor<T extends { messageId: string }>(thread: Pick<ThreadDoc,'lastReplyId'> | undefined, v: T | null | undefined): T | null` — returns `v` only when it matches `lastReplyId`.
  - `isSettled(thread: ThreadDoc | undefined): boolean` — `currentFor(thread, thread.settled) !== null`.
  - `clearedByAi(thread): boolean` — settled current and `by === 'ai'`.

- [ ] **Step 1: Write failing tests** in `functions/test/replyAi.test.ts`:
  - `autoClears({no_answer_needed: .95, needs_answer: .03, withdrawing: .01, unclear: .01})` → true; `.949` → false;
    `{no_answer_needed: .96, withdrawing: .10, …}` → false.
  - `mayWithdraw` true at `.30`, false at `.29`.
  - `wantsDraft` true when top is `needs_answer` or `unclear` and not autoClears; false for top `withdrawing`, and for top
    `no_answer_needed` at `.90`.
  - `currentFor({lastReplyId:'m2'}, {messageId:'m1'})` → null; matching id → the value; thread without `lastReplyId` → null.
  - `isSettled` / `clearedByAi` for `by:'ai'`, `by:'uid1'`, stale messageId, `settled: null`.
- [ ] **Step 2:** `cd functions && npx vitest run test/replyAi.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement types and functions. `topLabel` ties break in `REPLY_LABELS` order.
- [ ] **Step 4:** Run again → PASS; `npm run build` clean.
- [ ] **Step 5:** Commit `feat(reply-ai): shared reading rules and thread fields`.

### Task 2: AI clients (Decisions REST + Vertex draft) and fake

**Files:**
- Create: `functions/src/ai/replyAi.ts`, `functions/src/ai/replyPrompt.ts`, `functions/src/testing/fakeReplyAi.ts`
- Test: `functions/test/replyAiClient.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `GenAiLike`, `AI_TIMEOUT_MS`, `escapeAngles` from existing `ai/client.ts` / `ai/inputs.ts`.
- Produces:
  - `DECISION_MODEL = 'gemini-decision-1'`, `DRAFT_MODEL = 'gemini-3.8-flash'`, `DRAFT_MAX_TOKENS = 2048`
  - `interface DecisionResult { probabilities: Record<ReplyLabel, number>; confidence: number; model: string }`
  - `interface ReplyAi { decide(input: DecisionInput): Promise<DecisionResult>; draft(input: DraftInput): Promise<{ text: string; model: string }> }`
  - `interface DecisionInput { reply: string; quoted: string; previousTeam: { subject: string; text: string } | null }`
  - `interface DraftInput { facts: string; eventFields: { label: string; value: string }[]; templates: { name: string; text: string }[]; speaker: { firstName: string; talkTitles: string[] }; conversation: { from: 'team' | 'speaker'; at: number; text: string }[] }`
  - `decisionText(i: DecisionInput): string` and `draftPrompt(i: DraftInput): string` (in replyPrompt.ts, with `DRAFT_SYSTEM`)
  - `liveReplyAi(opts: { apiKey: string; project: string; fetchFn?: typeof fetch; genai?: GenAiLike; timeoutMs?: number }): ReplyAi`
  - `fakeReplyAi(opts?: { fail?: Set<string> }): ReplyAi & { calls: { decide: number; draft: number } }`

- [ ] **Step 1: Failing tests:**
  - `decide` sends `POST …/v1beta/decisions` with header `x-goog-api-key: k`, body `{ model: 'gemini-decision-1', input: <decisionText>, questions: { action: { type: 'choice', instructions, criteria: {needs_answer, no_answer_needed, withdrawing, unclear} } } }`; parses `answers.action.probabilities` and `confidence`.
  - Response missing a label, a non-number, or probabilities not summing to 1 ± 0.02 → rejects `invalid decision output`.
  - HTTP 400 with `{error:{code:'safety'}}` → rejects with message containing `http 400 safety` (no response text).
  - `decisionText`: unquoted reply first; when reply is blank, uses the first 2,000 chars of `quoted`; includes the previous team message subject/text capped to 4,000 chars; reply capped to 8,000; angles escaped.
  - `draftPrompt` includes facts, fields, template names, talk titles, conversation oldest→newest; a conversation over 30,000 chars keeps the newest messages.
  - `draft` calls `generateContent` with `DRAFT_MODEL`, `systemInstruction: DRAFT_SYSTEM`; blank output rejects `invalid draft output`; output trimmed and capped to 10,000 chars.
  - Fake: text containing `withdraw` → withdrawing .9; `thanks`/`teşekkür` → no_answer_needed .97; containing `?` → needs_answer .9; else unclear .7; `fail` set substring → throws.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `DRAFT_SYSTEM` must say: reply as the DevFest Istanbul speaker team; same language as the
  speaker's last message; use only the given facts; anything not in them becomes a short bracketed gap like
  `[venue address?]`; never invent dates, names, links or promises; no signature or sign-off name; plain text, short.
  Decision `instructions`: "What does the DevFest Istanbul speaker team need to do about this speaker's latest email?"
  with one-line criteria per option (needs_answer: asks a question or requests something; no_answer_needed: thanks,
  confirms, acknowledges; withdrawing: cancels or may not attend/speak; unclear: none of these fit).
- [ ] **Step 4:** Run → PASS; existing `aiClient.test.ts` still passes.
- [ ] **Step 5:** Commit `feat(reply-ai): decisions and draft clients with fake`.

### Task 3: Mail check records the newest reply id

**Files:**
- Modify: `functions/src/email/pollMail.ts` (thread update block, ~L150)
- Test: `functions/test/pollMail.emulator.test.ts`

**Interfaces:**
- Produces: `threads/{id}.lastReplyId` = Gmail id of the reply with the greatest `atMs` ever stored (kept when a new
  poll only finds older or non-reply messages).

- Also fills it in for threads from before this change (so "No reply needed" and "Draft a reply" work on replies already
  waiting): when a polled thread has `lastReplyAt` but no `lastReplyId`, read its newest 10 messages by `at` desc and
  take the first `kind === 'reply'`. This writes only the id; it never triggers an assessment (no backfill).

- [ ] **Step 1:** Failing emulator tests: after one reply → `lastReplyId === <id>`; after a later team message → unchanged; after two replies in one poll → the newer one's id; an older reply found late doesn't replace it; an old thread with `lastReplyAt` and stored reply messages but no `lastReplyId` gets it filled on the next poll even with no new messages.
- [ ] **Step 2:** `cd functions && npm run test:emulator -- pollMail` → FAIL.
- [ ] **Step 3:** Track the newest reply in the `stored` loop; set `lastReplyId` when its `atMs >= t.lastReplyAt` ms.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(reply-ai): threads remember their newest reply`.

### Task 4: assistReply, trigger and draftReply callable

**Files:**
- Create: `functions/src/email/assistReply.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/test/assistReply.emulator.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `assistReply(db: Firestore, ai: ReplyAi, p: { threadId: string; messageId: string; now: number }): Promise<'stale' | 'cleared' | 'drafted' | 'flagged' | 'failed'>`
  - `draftReply(db: Firestore, ai: ReplyAi, p: { threadId: string; now: number }): Promise<{ ok: true }>` — drafts for the current newest reply regardless of label; throws `ReplyNotFound` when the thread has no `lastReplyId`.
  - `buildDraftInput(db, threadId): Promise<DraftInput>` (reads thread messages, the thread's emails for team texts, `meta/event`, templates, speaker + approved talk titles).
  - index.ts: `assistNewReply = onDocumentCreated({ document: 'threads/{threadId}/messages/{messageId}', region, serviceAccount: SYNC_SERVICE_ACCOUNT, secrets: [GEMINI_API_KEY], retry: false, timeoutSeconds: 120 })`, returns early unless `kind === 'reply'`; `draftReplyNow = onCall(mailOpts + secrets)`, admins only, input `{ threadId }`.
  - `replyAi()` factory: emulator → `fakeReplyAi()`; else `liveReplyAi({ apiKey: GEMINI_API_KEY.value(), project })`, imported lazily like `aiClient()`.

- [ ] **Step 1:** Failing emulator tests (thread seeded with `lastReplyId: 'm1'`, message `m1`):
  - "thanks" → returns `cleared`; thread has `ai.label 'no_answer_needed'`, `settled {messageId:'m1', by:'ai', byName:'AI'}`, no `draft`.
  - "Can I bring my laptop?" → `drafted`; `ai.label 'needs_answer'`, `draft.messageId 'm1'`, no `settled`.
  - "I have to withdraw" → `flagged`; no draft, no settled.
  - messageId `m0` while `lastReplyId` is `m1` → `stale`, nothing written, `ai.decide` not called.
  - `lastReplyId` changes to `m2` between decide and write (fake hook) → nothing written for m1 (transaction re-check).
  - fake throws → `failed`; `ai = {messageId:'m1', label:null, …, error:'…'}`, no settled; function does not throw.
  - Existing `settled` for `m1` by an admin is not overwritten by the AI.
  - `draftReply` on a withdrawing reply → writes `draft`; on no `lastReplyId` → `ReplyNotFound`.
  - `buildDraftInput` never includes messages from another thread of the same speaker.
- [ ] **Step 2:** `npm run test:emulator -- assistReply` → FAIL.
- [ ] **Step 3:** Implement. All writes in one transaction that re-reads the thread and checks `lastReplyId === messageId`. Log `Reply assist: <result> thread=<id>` and error codes only.
- [ ] **Step 4:** PASS; `npm run build` clean; `npm test` green.
- [ ] **Step 5:** Commit `feat(reply-ai): assess new replies and draft answers`.

### Task 5: Security rules

**Files:**
- Modify: `firestore.rules` (threads, meta/event)
- Test: `tests/rules/firestore.rules.test.ts`

- [ ] **Step 1:** Failing rules tests:
  - Admin `updateDoc(threads/th1, { settled: { messageId, by: <own uid>, byName: <own name>, at: serverTimestamp() } })` allowed; `settled: null` (Undo) allowed.
  - Admin changing any other thread field, or `settled.by: 'ai'`, or another uid → denied. Member → denied.
  - `meta/event` with `speakerFacts` string of 20,000 chars allowed; 20,001 or a non-string → denied.
- [ ] **Step 2:** `npm test` (root) → FAIL.
- [ ] **Step 3:** Add `allow update: if isAdmin() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['settled']) && (settled == null || shape-check)`; extend meta/event `hasOnly` with `speakerFacts` and its check.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(reply-ai): rules for settling replies and speaker facts`.

### Task 6: Follow-up rule and Emails page

**Files:**
- Modify: `web/src/lib/emails.ts`, `web/src/pages/EmailsPage.tsx`
- Test: `web/src/lib/emails.test.ts`, `web/src/lib/stages.test.ts`

**Interfaces:**
- Consumes: `isSettled`, `clearedByAi`, `currentFor`, `mayWithdraw` from `functions/src/shared/replyAi.ts`.
- Produces: `speakerWroteLast(thread)` = existing rule `&& !isSettled(thread)`; `aiNote(thread): { text: string; tone: 'warn' | '' } | null`;
  EmailsPage filter `['ai', 'Cleared by AI', (e, t) => clearedByAi(t)]` after "Needs a look"; withdrawing rows show a warn chip "May be withdrawing".

- [ ] **Step 1:** Failing tests: settled current → `speakerWroteLast` false, `needsLook` false; settled stale → true; `latestLine` for a cleared thread says `Cleared by AI · <snippet>`; Stages `stageCell` for a cleared thread is `replied`, not `answer`; `aiNote` texts exactly per Global Constraints (percent = `Math.round(p*100)` of the top label).
- [ ] **Step 2:** `cd web && npx vitest run src/lib/emails.test.ts src/lib/stages.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm run build` clean.
- [ ] **Step 5:** Commit `feat(reply-ai): follow-up respects settled replies; Cleared by AI filter`.

### Task 7: Conversation sheet

**Files:**
- Modify: `web/src/components/Conversation.tsx`, `web/src/data/actions.ts`, `web/src/data/mailActions.ts`
- Test: `web/src/components/Conversation.test.tsx` (create)

**Interfaces:**
- Consumes: Task 6 `aiNote`; Task 4 callable `draftReplyNow`.
- Produces: `settleReply(threadId, messageId, me)` and `unsettleReply(threadId)` in actions.ts; `draftReply = call<{threadId:string},{ok:true}>('draftReplyNow')` in mailActions.ts.

- [ ] **Step 1:** Failing component tests:
  - Under the newest reply, the AI line shows `aiNote` text; admins see "No reply needed" (unsettled) or "Undo" (settled).
  - The reply box pre-fills with `draft.text` when empty and the draft is current; doesn't overwrite typed text.
  - No current draft → "Draft a reply" button; with a draft → "Redraft"; both call `draftReply`.
  - Send with `[...]` in the body shows an inline "This reply still has gaps like [venue address?]. Send anyway?" with Send anyway / Keep editing; no `window.confirm`.
  - Members see the draft as read-only text and no buttons.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Gap regex `/\[[^\]\n]{1,80}\]/`.
- [ ] **Step 4:** PASS; build clean.
- [ ] **Step 5:** Commit `feat(reply-ai): AI reading, drafts and settle controls in the conversation`.

### Task 8: Speaker facts in Event settings

**Files:**
- Modify: `web/src/pages/EventSettingsPage.tsx`, `web/src/data/actions.ts` (`saveEvent(fields, signatureHtml, speakerFacts, me)`)
- Test: existing EventSettings tests or `web/src/pages/EventSettingsPage.test.tsx` (create)

- [ ] **Step 1:** Failing test: a "Speaker facts" section under Team signature with a textarea (admins) / plain text (members), a counter, Save disabled over 20,000 chars, dirty tracking includes it; help text "What reply drafts may state. Anything not here becomes a [gap] in the draft."
- [ ] **Step 2–4:** Implement, PASS, build.
- [ ] **Step 5:** Commit `feat(reply-ai): speaker facts in event settings`.

### Task 9: Seed, README, full suites

**Files:**
- Modify: `functions/scripts/seed-emulator.ts`, `README.md`

- [ ] **Step 1:** Seed: one thread with a needs-answer reading + draft, one cleared by AI, one withdrawing; a short sample `speakerFacts`.
- [ ] **Step 2:** README "Reply assistant" section: what it does, the `GEMINI_API_KEY` secret (billed AI Studio key), the cut-offs and where to tune them, no backfill.
- [ ] **Step 3:** Run all four suites (functions, functions emulator, rules, web) and the web build; all green.
- [ ] **Step 4:** Commit `docs(reply-ai): seed and README`.

### Task 10 (controller, not a subagent): First Speaker facts

Done by the controller after the build, because it reads real mail:
- Read 2025 speaker conversations in organizer@ read-only (delegated Gmail, like `scripts/import-sent.ts`), keep only
  general event facts with no personal data; combine with https://devfest.istanbul/ and the 2026 templates; mark every
  fact not confirmed for 2026 as `[2026: ?]`.
- Show the text to the owner; save to `meta/event.speakerFacts` only after approval. Nothing printed to logs or committed.
