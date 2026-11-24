# AI reply assistant (project B)

## Why

Speakers reply to the team's emails: questions ("can I bring my own laptop?"), yes/no confirmations, thank-yous,
withdrawals. Today every reply makes the speaker "needs follow-up" (Emails page "Needs a look", Stages "Replied, needs
an answer") until a teammate answers in that conversation, so a "Thanks, see you there!" weighs the same as a real
question, and answers are written from memory. The owner wants Gemini to (1) decide whether a reply needs an answer and
(2) draft a reply suggestion.

## What the owner decided (2026-11-24)

- **The decision uses the Gemini Decisions API** (`gemini-decision-1`, launched 2026-11-11), not a generative prompt.
  It is on the Gemini Developer API only (v1beta, API key; not Vertex yet). The owner created a key on a billed
  AI Studio project; it is stored as the Firebase secret **`GEMINI_API_KEY`** (version 1, enabled).
- **Trust level: the middle option.** When the decision is very sure a reply needs no answer, the reply is cleared
  automatically into a visible **"Cleared by AI"** group with Undo. Anything less sure stays flagged, showing the AI's
  reading and a one-click **"No reply needed"**. **Withdrawing never clears anything**; it shows a warning.
- **What the draft knows: approach 1, a "Speaker facts" box** the team edits in Event settings. Claude fills the first
  version once from https://devfest.istanbul/ and from the team's answers in last year's (2025) speaker emails,
  converted to 2026; the owner reviews it before it is saved. Drafts read only: that box, Event settings fields, the
  template texts, the speaker's talk(s), and this speaker's own conversation. Never other speakers' emails, never the
  live web.
- Approaches rejected for the draft: (2) look things up each time (live site + searching 2025 emails): risks stating
  2025 dates/venue confidently, reads other speakers' personal emails, and hides what the draft relied on. (3) Gemini
  web search grounding: least control, and the site lacks most of what speakers ask (no schedule yet, no hotel, slides,
  AV, dinner).

## Goals

- Every new speaker reply gets a decision: needs an answer / no answer needed / withdrawing, with probabilities.
- Follow-up everywhere (Emails "Needs a look", Stages cells, counts) respects the decision and the manual
  "No reply needed", through the one existing function (`speakerWroteLast` in web/src/lib/emails.ts).
- Replies that need an answer get a draft in the conversation sheet's reply box, which the admin edits and sends as
  today (team signature added on send).
- A "Cleared by AI" list the team can scan and undo.
- Admins edit Speaker facts in Event settings.

## Non-goals

- Sending anything automatically. A person always presses Send.
- Acting on a withdrawal (declining the talk, changing status). It only warns.
- Reading attachments, or replies from people who are not the speaker (the existing parser already separates
  replies, bounces and team messages).
- Per-person tone/signatures; multiple drafts to choose from.
- **Replies already waiting at launch** (owner, 2026-11-24: "leave them"). No backfill: only replies that arrive after
  deploy are read. Older flagged replies stay flagged as today, and admins can still use "No reply needed" and
  "Draft a reply" on them.

## Anti-goals (failure even if it works)

- A speaker question silently disappears (cleared without a visible trace, or cleared while unsure).
- A draft states a fact that is wrong for 2026 or that nobody gave it, without marking it as a gap.
- Speaker emails reach a free-tier key, logs, or another speaker's draft.
- AI failure (quota, outage, bad key) hides a reply: on any failure the reply stays flagged exactly as today.

## Design

### When it runs

A Firestore trigger on `threads/{threadId}/messages/{messageId}` created with `kind: 'reply'` (written by the existing
5-minute mail check). It: (1) runs the decision; (2) writes a draft only when the top label is `needs_answer` or `unclear` and the reply was
not auto-cleared. No draft for `withdrawing` or a flagged "probably no answer needed" (Claude's call: a pre-filled
reply to a "thanks" or a withdrawal is noise to delete). Any flagged reply without a draft shows a **"Draft a reply"**
button, which is also how a reply gets a draft after Undo (Undo itself never drafts). Only the
newest reply of a thread matters: if a newer reply arrived meanwhile, the older result is discarded (results carry the
message id they are for).

### The decision

- Input: the speaker's new reply text (unquoted part), plus the team's previous message in the thread (subject and
  text) so "Yes" or "Thanks" can be read in context. Capped in size.
- One `choice` question with options `needs_answer`, `no_answer_needed`, `withdrawing`, `unclear` (the catch-all,
  because choice probabilities always sum to 1).
- Stored on the thread as `ai: { messageId, label, probabilities, confidence, model, at }`.
- **Auto-clear** when `no_answer_needed ≥ 0.95` and `withdrawing < 0.10`. The cut-off is a constant in code, to be
  tuned after looking at real results (probabilities are stored for that).
- **Withdrawing warning** when `withdrawing ≥ 0.30` (leans to over-warning).

### Settled replies

A reply counts as answered when the team wrote after it (today's rule) **or** the thread has
`settled: { messageId, by: 'ai' | uid, byName, at }` for that newest reply. `speakerWroteLast` becomes "speaker wrote
last and the newest reply is not settled". A newer reply un-settles automatically (different messageId).

- Auto-clear writes `settled` with `by: 'ai'`. Undo removes it (the reply is flagged again; it is not re-cleared).
- "No reply needed" writes `settled` with the admin's uid.

### The draft

- Model: the existing Vertex setup (gemini-3.8-flash, `eu`), as for talk overviews.
- Input: Speaker facts, Event settings fields, template texts, the speaker's name and talk title(s), and the
  conversation (oldest to newest, capped).
- Output: plain text in the speaker's language (English or Turkish, matching the reply), no signature (added on send).
  Anything it does not know becomes a visible gap in square brackets, e.g. `[venue address?]`.
- Stored as `threads/{threadId}.draft: { messageId, text, model, at }`. The reply box pre-fills with it (only when empty
  and the draft is for the newest reply) and the admin edits it. A "Redraft" button asks for a new one.
- Sending is unchanged: a draft with an unfilled `[...]` gap asks for confirmation in the page before sending (no
  browser dialog).

### Speaker facts

- `meta/event.speakerFacts`: plain text, up to 20,000 characters, admin-edited in Event settings under the signature.
- Claude prepares the first version (website + 2025 team answers converted to 2026, no personal data), shows it to
  the owner, and saves it after approval.

### Where it shows

- **Conversation sheet:** under the newest reply, a line with the AI reading ("AI: needs an answer · 92%",
  "AI: no reply needed · cleared", "AI: may be withdrawing"), "No reply needed" / Undo for admins, and the draft in the
  reply box.
- **Emails page:** a "Cleared by AI" filter beside "Needs a look"; withdrawing shows as a warning chip.
- **Stages:** cells use the same rule, so a cleared reply shows "Replied" instead of "needs an answer".
- Members see readings and drafts; only admins settle, undo, redraft or send.

### Data, privacy, cost

- Decision calls go to the Gemini Developer API with `GEMINI_API_KEY` (billed, so not used for training). Drafts go to
  Vertex EU. Logs hold counts and ids only, as for mail.
- AI fields (`ai`, `draft`) are written only by functions; `settled` and `speakerFacts` by admins (rules with shape
  checks), or by functions.
- Cost is pennies: about $0.10 per million input tokens for decisions, and one Flash call per reply that needs an
  answer.
- The emulator uses fakes for both, never calling Google.

## Calls made after the builder check (Claude's calls)

1. **Which replies get a draft:** see "When it runs" above.
2. **Newest reply id:** the thread doc gains `lastReplyId` (set by the mail check), so `settled.messageId`, `ai.messageId`
   and `draft.messageId` can be compared with the newest reply.
3. **Rules:** `threads/{id}` stays function-written, except admins may write or remove `settled` (shape-checked, their
   own uid). "Draft a reply" / Redraft is a callable (admins), so drafting stays server-side.
4. **Speaker facts preparation:** Claude reads the 2025 speaker conversations in the organizer@ mailbox with the same
   one-off, read-only script approach used for the sent-mail import (delegated Gmail), extracts only general event
   facts (no names, addresses or anything about a person), takes 2026 values from the website and the 2026 templates,
   and marks every fact it cannot confirm for 2026 as `[2026: ?]` for the owner to fill. The owner approves before it is
   saved. Drafting may go live before that: with empty facts the drafts simply carry more `[...]` gaps.
5. **Drafts are visible to members** as read-only text in the conversation sheet; only admins get the editable reply box.

## Left to the builder

- Exact prompts, input caps, the trigger's retry settings, component split.
- Whether "Redraft" is a callable or a field the trigger watches.
- How the existing Decisions API types are added to the `@google/genai` SDK (upgrade to ≥3.2, which adds
  `ai.decisions.create`).
- Seed data: one reply needing an answer with a draft, one cleared by AI, one withdrawing.
