# Speaker Email (Project 1: Templates, Sending, Replies) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins email speakers from stored templates or one-off, now or scheduled, through the team's Workspace Gmail; everyone on the team sees each email's state (sent, bounced, replied) and reads full replies.

**Architecture:** Pure logic (fill-ins, recipients and decision readiness, MIME, message parsing) lives in import-light files under `functions/src/email/` that the web app also bundles, so the preview is the server's own rendering. Every send becomes an `emails/{id}` document; a 1-minute scheduled function claims and sends due emails through a `GmailClient` (real: domain-wide delegation; emulator: fake); a 5-minute scheduled function reads the threads the dashboard started and records replies and bounces under `threads/{threadId}/messages`. Clients write only templates and event settings; everything about sending is written by functions.

**Tech Stack:** Firebase Functions v2 (europe-west1, Node 22), Firestore, Storage, `googleapis` Gmail v1, IAM Credentials `signJwt`; React 19 + Vite + TS, plain CSS per DESIGN.md; Vitest, `@firebase/rules-unit-testing`.

**Spec:** `docs/superpowers/specs/2026-11-23-speaker-email-design.md`

**Mockups:** `docs/mockups/2026-11-23-email/` (approved). Port their layout, copy and states; their `mail.css` rules move into `web/src/styles.css`.

## Global Constraints

- Sender is a real Workspace user mailbox, reached with a service account and domain-wide delegation, scopes `https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/gmail.readonly`. Address and account are function params `MAIL_SENDER` and the existing `SYNC_SERVICE_ACCOUNT`; never hardcoded.
- Region `europe-west1`. No new npm dependencies (no rich-text editor, no HTML sanitizer library, no MIME library).
- Admins: templates, event settings, send, schedule, cancel, mark as emailed, reply. Members: read templates, event settings, emails, threads and replies; download reply attachments. Waiting/removed: nothing.
- No tracking pixel; states tracked: scheduled, queued, sending, sent, failed, unknown, held, cancelled, plus bounced and replied flags.
- Logs hold counts and ids only: never addresses, subjects, bodies or reply text. No real speaker data in tests, seeds or fixtures (use `fakeRows.ts` shapes, `example.com`).
- Attachments per email at most 20 MB in total.
- Times are entered and shown in Istanbul time (UTC+3, no DST), stored as UTC.
- Email-state chips are neutral (DESIGN.md ink/grey); the four status colours stay reserved for review status.
- Files under `functions/src/email/` that the web imports (`fillIns.ts`, `recipients.ts`) and `functions/src/shared/*` may import only `../model.js`, `../talkKey.js` and each other; header comment says so, like `model.ts`.
- Commits: no Claude author, co-author or "Generated with" lines (owner's CLAUDE.md).

## Review Focus

1. A speaker whose decision changed after a decision email (declined → approved, or a second talk approved) must never land in a batch; they appear under "Needs a follow-up", and the follow-up lists only uncovered talks. → Task 3 tests `followUp*`.
2. Double-clicked Send, or a retried callable, must not create a second email. → Task 7 test `enqueue is idempotent per batch and speaker`.
3. A crash between Gmail and Firestore must leave `unknown`, never a resend. → Task 7 test `stale sending becomes unknown and is never sent again`.
4. A scheduled email whose speaker's status changed, or whose event fill-in was emptied, is `held` with a reason, not sent and not failed. → Task 7 test `scheduled email is held when no longer eligible`.
5. A reply in HTML only, or with a forged `From: mailer-daemon` display name but a normal body, is classified correctly; HTML never reaches the page as markup. → Task 4 tests `htmlOnlyReply`, `bounceNeedsReport`.

---

### Task 1: Share card grouping with the functions

The server must judge readiness from the same cards the team sees.

**Files:**
- Create: `functions/src/shared/cards.ts`, `functions/src/shared/time.ts` (moved from `web/src/lib/cards.ts`, `web/src/lib/time.ts`, imports switched to `.js`)
- Modify: `web/src/lib/cards.ts`, `web/src/lib/time.ts` become one-line re-exports (`export * from '../../../functions/src/shared/cards.ts'`), so the 22 web importers don't change
- Move tests: `web/src/lib/cards.test.ts`, `time.test.ts` stay where they are (they test through the re-export)

**Interfaces:**
- Produces: `buildCards(subs: Submission[], hasReviewData: (id: string) => boolean): Card[]`, `cardFor`, `type Card`, `submittedAtMs`, `compareSubmitted` importable from `functions/src/shared/*.js`.

- [ ] Step 1: Move the files; `cd functions && npx tsc --noEmit` passes; `cd web && npx vitest run && npx tsc -b` pass.
- [ ] Step 2: Commit `refactor: share card grouping between web and functions`.

### Task 2: Model types and fill-in rendering

**Files:**
- Modify: `functions/src/model.ts` (types below)
- Create: `functions/src/email/fillIns.ts`
- Test: `functions/test/fillIns.test.ts`

**Interfaces:**
- Produces (model.ts):
  - `RecipientRule = 'acceptance' | 'decline' | 'approved' | 'anyone'`
  - `TemplateAttachment { path: string; name: string; size: number; contentType: string }`
  - `EmailTemplate { name; subject; body; attachments: TemplateAttachment[]; rule: RecipientRule; stageId: string | null; updatedAt: Ts; updatedBy: string; updatedByName: string }` at `templates/{id}`
  - `EventField { key: string; label: string; value: string }`; `EventSettings { fields: EventField[]; updatedAt; updatedBy; updatedByName }` at `meta/event`
  - `EmailState = 'scheduled' | 'queued' | 'sending' | 'sent' | 'failed' | 'unknown' | 'held' | 'cancelled'`
  - `EmailDoc` at `emails/{id}`: `{ batchId; speakerKey; to: string; cc: string[]; templateId: string | null; templateName: string; rule: RecipientRule; isDecision: boolean; talkIds: string[]; subject: string | null; text: string | null; attachments: TemplateAttachment[]; sendAt: Ts; state: EmailState; reason: string | null; manual: boolean; replyToThreadId: string | null; gmailMessageId: string | null; threadId: string | null; rfcMessageId: string | null; claimedAt: Ts | null; sentAt: Ts | null; bounce: { reason: string; at: Ts } | null; replyCount: number; lastReplyAt: Ts | null; by: string; byName: string; createdAt: Ts }` (`subject`/`text` null until rendered for scheduled emails)
  - `ThreadDoc` at `threads/{threadId}`: `{ speakerKey; firstSentAt: Ts; lastCheckedAt: Ts | null; seenIds: string[]; lastReplyAt: Ts | null; lastTeamAt: Ts | null; lastSnippet: string }` (`lastTeamAt` = latest of our sends and `team` messages; `lastSnippet` = first 140 chars of the newest message's text)
  - `ReceivedMessage` at `threads/{threadId}/messages/{gmailId}`: `{ kind: 'reply' | 'bounce' | 'team'; from: string; to: string[]; cc: string[]; at: Ts; subject: string; text: string; quoted: string; attachments: { id: string; name: string; size: number; mimeType: string }[] }`
  - `MailMeta` at `meta/mail`: `{ lastPollAt: Ts | null; lastSendAt: Ts | null; error: string | null }`
- Produces (fillIns.ts):
  - `SPEAKER_FILL_INS = ['firstName','lastName','fullName','talkTitles','talkCount','coSpeakerNames'] as const`
  - `fillInsIn(text: string): string[]` (names in `{{ name }}`, whitespace allowed, de-duplicated, order of appearance)
  - `renderEmail(t: { subject: string; body: string }, values: Record<string, string>): { ok: true; subject: string; text: string; html: string } | { ok: false; missing: string[]; empty: string[] }`
  - `validEventKey(key: string, existing: string[]): string | null` (error text or null; key must match `/^[a-zA-Z][a-zA-Z0-9]*$/`, not a `SPEAKER_FILL_INS` name, unique)

- [ ] Step 1: Tests:
  - `renderEmail({subject:'Hi {{firstName}}',body:'Talks:\n{{talkTitles}}'}, {firstName:'Ada', talkTitles:'• A\n• B'})` → `ok`, subject `Hi Ada`, text keeps the newlines.
  - unknown `{{venu}}` → `{ok:false, missing:['venu'], empty:[]}`; known but `''` → `empty:['venue']`.
  - html: paragraphs split on blank lines into `<p>`, single newlines `<br>`, `https://x.test/a?b=1&c` becomes an `<a>` with `&amp;`, and `<script>` in a value is escaped.
  - `{{ firstName }}` with spaces fills; `{firstName}` single braces is left as text.
  - `validEventKey('firstName', [])` → error; `('venue', ['venue'])` → error; `('venue', [])` → null.
- [ ] Step 2: Run `cd functions && npx vitest run test/fillIns.test.ts`: FAIL. Implement. PASS.
- [ ] Step 3: Commit `feat(email): template fill-ins and rendering`.

### Task 3: Recipients, decision readiness and follow-ups

**Files:**
- Create: `functions/src/email/recipients.ts`
- Test: `functions/test/recipients.test.ts` (build cards with `fakeSubmission` helpers)

**Interfaces:**
- Consumes: `Card`, `buildCards` (Task 1); `EmailDoc`, `RecipientRule` (Task 2).
- Produces:
  - `SpeakerGroup { speakerKey; name: { first: string; last: string }; email: string; cards: Card[] }`; `speakerGroups(cards: Card[]): SpeakerGroup[]` (excludes `removedFromSheet` and `noSession` cards; email and name from the most recently submitted remaining card)
  - `decision(g: SpeakerGroup, status: (id: string) => Status): 'approved' | 'declined' | 'not-ready'`
  - `Eligibility = { ok: true; talkIds: string[]; cc: string[]; flags: string[] } | { ok: false; reason: string }`
  - `eligibility(rule: RecipientRule, g: SpeakerGroup, status, history: EmailDoc[], opts: { followUp?: boolean; templateId?: string | null }): Eligibility`
  - `needsFollowUp(g, status, history): string[]` (approved talk ids not covered by any sent decision email, non-empty only when the speaker already has a sent decision email)
  - `fillInValues(g: SpeakerGroup, talkIds: string[], event: EventField[]): Record<string, string>` (`talkTitles` = `• title` lines in submission order; `coSpeakerNames` joined with `, `)
- Rules the tests pin (history = this speaker's `EmailDoc`s with state `sent`, manual included):
  - `acceptance`: decision must be `approved`; talkIds = approved talks. `decline`: decision `declined`; talkIds = all talks.
  - Batch (no `followUp`): any sent decision email → `{ok:false, reason:'Already had a decision email'}`.
  - `followUp` with acceptance: talkIds = `needsFollowUp`; empty → not ok.
  - `approved`: at least one approved talk; talkIds = approved talks. `anyone`: always ok; talkIds = all talks.
  - Non-decision rule and same `templateId` already sent → `{ok:false, reason:'Already sent this template'}` unless `opts.followUp` (the explicit per-speaker resend).
  - cc = co-speaker emails of the covered talks, lower-cased, de-duplicated, excluding the speaker's own.
  - flags: a co-speaker who is also a main speaker of another card → `'Co-speaker Ana is also a speaker'`; acceptance for a speaker with a declined co-spoken talk → `'Co-speaker on a declined talk is not notified'`.

- [ ] Step 1: Tests named `acceptanceListsOnlyApproved`, `pendingIsNotReady`, `allDeclinedGetsDecline`, `batchSkipsAnyPriorDecision`, `followUpAfterDecline`, `followUpSecondApprovedTalk`, `approvedRuleRejectsDeclined`, `sameTemplateNotTwice`, `ccExcludesSelfAndDupes`, `flagsCoSpeakerEdgeCases`, `removedAndNoSessionIgnored`, `fillInValuesFormat`.
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: Commit `feat(email): recipient rules, readiness and follow-ups`.

### Task 4: MIME building and message parsing

**Files:**
- Create: `functions/src/email/mime.ts`, `functions/src/email/parseMessage.ts`
- Test: `functions/test/mime.test.ts`, `functions/test/parseMessage.test.ts`

**Interfaces:**
- Produces:
  - `buildRaw(m: { from: string; to: string; cc: string[]; subject: string; text: string; html: string; attachments: { name: string; contentType: string; data: Buffer }[]; inReplyTo?: string; references?: string; messageId: string }): string` (base64url of an RFC 5322 message: `multipart/mixed` > `multipart/alternative` (text, html) + attachments; headers RFC 2047-encoded when non-ASCII; bodies base64 with 76-char lines)
  - `newMessageId(domain: string): string` (`<random@domain>`)
  - `GmailMessage` (the subset of `gmail_v1.Schema$Message` used: `id`, `threadId`, `labelIds`, `internalDate`, `payload`)
  - `parseMessage(m: GmailMessage, sender: string): Omit<ReceivedMessage, 'at'> & { atMs: number; rfcMessageId: string }`
  - kind: `team` when `labelIds` has `SENT` or From address equals `sender`; `bounce` only when the payload is `multipart/report` with `report-type=delivery-status`, or From address local part is `mailer-daemon`/`postmaster` **and** a `message/delivery-status` part exists; otherwise `reply`.
  - bounce reason: `Diagnostic-Code` or `Status` from the delivery-status part, else the first 300 chars of text.
  - text: `text/plain` part if present, else HTML converted (block tags → newlines, `<br>` → newline, tags stripped, entities decoded, runs of 3+ newlines collapsed). Never returns markup.
  - quoted: split at Gmail's `gmail_quote` block (HTML), or the first line matching `/^On .+ wrote:$/` or `/^\d{1,2} .+ tarihinde .+ şunu yazdı:$/`, or a run of `>` lines at the end.
- [ ] Step 1: Tests: `roundTripsTurkishSubject` (decode the raw and find `=?UTF-8?B?` subject), `attachmentsAndAlternative`, `replyHeaders`, `plainReply`, `htmlOnlyReply`, `quoteSplitEnglishAndTurkish`, `bounceNeedsReport` (a forged From `Mail Delivery Subsystem <mailer-daemon@x>` with no report part is a `reply`), `realBounceReason`, `teamMessageBySentLabel`.
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: Commit `feat(email): MIME building and reply/bounce parsing`.

### Task 5: Gmail client (real and fake)

**Files:**
- Create: `functions/src/email/gmail.ts`, `functions/src/testing/fakeGmail.ts`
- Test: `functions/test/gmail.test.ts` (fake only; the real client gets a token-exchange unit test with a stubbed fetch)

**Interfaces:**
- Produces:
  - `interface GmailClient { send(raw: string, threadId?: string): Promise<{ id: string; threadId: string }>; getThread(threadId: string): Promise<GmailMessage[]>; getAttachment(messageId: string, attachmentId: string): Promise<Buffer> }`
  - `delegatedGmail(opts: { serviceAccount: string; sender: string }): GmailClient`: signs a JWT with IAM Credentials `projects/-/serviceAccounts/{sa}:signJwt` (`iss`=sa, `sub`=sender, `scope`= both scopes space-separated, `aud`=`https://oauth2.googleapis.com/token`, `exp`=now+3600), exchanges it (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`), caches the token until 5 minutes before expiry, uses `google.gmail({version:'v1'})` with `userId: 'me'`.
  - `fakeGmail(): GmailClient & { sent: { raw: string; threadId?: string }[]; addReply(threadId: string, m: GmailMessage): void; failNext(err: Error): void }`
- [ ] Step 1: Tests: fake `send` returns stable ids and a new thread unless `threadId` given; `getThread` returns sent + added messages; real client caches a token across two calls (stubbed fetch called once).
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: Commit `feat(email): Gmail client with domain-wide delegation and a fake`.

### Task 6: Security rules

**Files:**
- Modify: `firestore.rules`, `storage.rules`
- Test: `tests/rules/firestore.rules.test.ts`, `tests/rules/storage.rules.test.ts`

Rules:
- `templates/{id}`: read members; create/update admins with keys `hasOnly(['name','subject','body','attachments','rule','stageId','updatedAt','updatedBy','updatedByName'])`, `rule in [...]`, `updatedBy == uid`, `updatedByName == me().name`, `updatedAt == request.time`, `name` and `subject` non-empty strings, `body` string ≤ 50,000 chars; delete admins.
- `meta/event`: read members (already); write admins with keys `hasOnly(['fields','updatedAt','updatedBy','updatedByName'])`, `fields` a list of ≤ 50. Keep every other `meta/*` write false.
- `emails/*`, `threads/*`, `threads/*/messages/*`: read members; write false.
- Storage `emailAttachments/{templateId}/{file}`: read members; write admins, `request.resource.size < 20 * 1024 * 1024`; delete admins.
- [ ] Step 1: Tests per path for admin/member/waiting/removed/signed-out, plus: member cannot write a template; admin cannot set `updatedByName` to someone else; admin cannot write `meta/sync`; nobody writes `emails`.
- [ ] Step 2: Run `npm test` at repo root (rules emulator): FAIL → change rules → PASS.
- [ ] Step 3: Commit `feat(email): security rules for templates, event settings and mail`.

### Task 7: Queue: enqueue and send

**Files:**
- Create: `functions/src/email/queue.ts`, `functions/src/email/loadSpeakers.ts`
- Test: `functions/test/queue.emulator.test.ts`

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces:
  - `loadSpeakers(db): Promise<{ groups: SpeakerGroup[]; status: (id: string) => Status; historyOf: (speakerKey: string) => EmailDoc[]; event: EventField[] }>` (cards via `buildCards` with the web's `hasReviewData` rule: review, score or comment exists)
  - `EnqueueInput { batchId: string; templateId: string | null; custom: { subject: string; body: string } | null; speakerKeys: string[]; followUp: boolean; sendAt: number | null; includeCc: boolean; replyToThreadId: string | null }`
  - `enqueue(db, input, actor: { uid; name }): Promise<{ queued: string[]; skipped: { speakerKey: string; reason: string }[] }>`
  - `processQueue(db, gmail: GmailClient, opts: { sender: string; now: number; readAttachment: (path: string) => Promise<Buffer> }): Promise<{ sent: number; failed: number; held: number; unknown: number }>`
  - `markEmailed(db, input: { templateId: string; speakerKeys: string[]; at: number }, actor): Promise<number>`
  - `cancelEmail(db, id, actor)`, `rescheduleEmail(db, id, sendAt: number, actor)` (only while `scheduled`), `resolveUnknown(db, id, to: 'sent' | 'requeue', actor)`
- Behaviour pinned:
  - Email id = `${batchId}__${sha1(speakerKey).slice(0,12)}`; created with `create()`, an existing id is returned in `queued` without change.
  - `followUp: true` requires exactly one speaker.
  - `sendAt` null → render now (state `queued`, `subject`/`text` stored); a future `sendAt` → state `scheduled`, `subject`/`text` null. Ineligible or blocked recipients go to `skipped` with the reason.
  - `replyToThreadId`: rule `anyone`, `threadId` set, subject `Re: <first subject in thread>`, headers from the thread's last message.
  - `processQueue` order: (1) `sending` with `claimedAt` older than 10 min → `unknown`; (2) `scheduled` with `sendAt <= now` → re-check eligibility and render; fail → `held` with reason, else `queued`; (3) each `queued` (max 50 per run, `sendAt` ascending): transaction `queued`→`sending` + `claimedAt`, then `gmail.send`, then `sent` with ids and `sentAt`, upsert `threads/{threadId}`; Gmail error → `failed` with message. Batch sends pause 1 s between messages.
  - Never sends a doc not in `queued`; `requeue` from `unknown` is the only way back.
  - `markEmailed` writes `sent` docs with `manual: true`, `talkIds` from current eligibility (ignoring the prior-decision check), `subject`/`text` null.
- [ ] Step 1: Emulator tests: `enqueue is idempotent per batch and speaker`, `batch skips speakers with any prior decision`, `send now stores the rendered email`, `scheduled email renders at send time with new event value`, `scheduled email is held when no longer eligible`, `stale sending becomes unknown and is never sent again`, `gmail failure marks failed`, `cancel only before sending`, `mark emailed in bulk blocks later batches`, `reply goes to the same thread`.
- [ ] Step 2: `cd functions && npm run test:emulator`: FAIL → implement → PASS.
- [ ] Step 3: Commit `feat(email): send queue with scheduling and no double sends`.

### Task 8: Reading replies and bounces

**Files:**
- Create: `functions/src/email/pollMail.ts`
- Test: `functions/test/pollMail.emulator.test.ts`

**Interfaces:**
- Produces: `pollMail(db, gmail, opts: { sender: string; now: number }): Promise<{ threads: number; replies: number; bounces: number }>`; `attachmentFor(db, gmail, threadId: string, messageId: string, attachmentId: string): Promise<{ name: string; mimeType: string; data: Buffer }>` (refuses ids not stored under that thread).
- Behaviour pinned: threads with `firstSentAt` within 90 days; skip message ids in `seenIds` or equal to an `EmailDoc.gmailMessageId`; store others as `ReceivedMessage`; a `bounce` sets `bounce` on the thread's latest sent `EmailDoc` before the bounce; a `reply` increments `replyCount` and sets `lastReplyAt` on the thread's latest sent `EmailDoc`; `team` messages are stored but change no counts. Every stored message updates `lastReplyAt` (reply) or `lastTeamAt` (team) and `lastSnippet` on the thread; `processQueue` sets `lastTeamAt` and `lastSnippet` when it sends into a thread. Per-thread errors are counted, written to `meta/mail.error` as `N threads could not be read`, and don't stop other threads.
- [ ] Step 1: Tests: `stores a reply once across two polls`, `bounce flags the email`, `team reply stored without counting`, `old threads not polled`, `attachment only for stored ids`.
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: Commit `feat(email): read replies and bounces from sent threads`.

### Task 9: Wire functions, seed templates, emulator data

**Files:**
- Modify: `functions/src/index.ts`, `functions/scripts/seed-emulator.ts`, `README.md`
- Create: `functions/src/email/seedTemplates.ts`

**Interfaces:**
- Produces callables (all `region`, `serviceAccount: SYNC_SERVICE_ACCOUNT`): `queueEmails(EnqueueInput)` admin; `sendTestEmail({ templateId | custom, speakerKey })` admin, sends to the caller's own `users/{uid}.email` with subject prefixed `[TEST] `, no `EmailDoc`; `cancelEmail({ id })`, `rescheduleEmail({ id, sendAt })`, `resolveUnknownEmail({ id, to })`, `markEmailed({ templateId, speakerKeys })` admin; `emailAttachment({ threadId, messageId, attachmentId })` member, returns `{ name, mimeType, base64 }`, refuses > 10 MB.
- Emulator only (registered when `FUNCTIONS_EMULATOR === 'true'`, refuses otherwise): `devInjectMail({ threadId, kind: 'reply' | 'bounce', text })` admin, adds a message to the in-memory fake Gmail; `devRunMail()` admin, runs `processQueue` and `pollMail` once. The fake Gmail is a module-level singleton so sends and polls share it.
- Schedules: `sendDueEmails` `every 1 minutes`, `pollMailbox` `every 5 minutes`; both write `meta/mail`.
- `gmailClient()`: `fakeGmail()` in the emulator (like `aiClient()`), else `delegatedGmail({ serviceAccount: SYNC_SERVICE_ACCOUNT.value(), sender: MAIL_SENDER.value() })`. New param `MAIL_SENDER = defineString('MAIL_SENDER')`.
- `seedTemplates(db)`: when `templates` is empty, creates `acceptance` (rule acceptance) and `decline` (rule decline) with placeholder English text using `{{firstName}}`, `{{talkTitles}}`, `{{eventName}}`, and `meta/event` with `eventName`, `eventDate`, `venue` empty values; called at the start of `queueEmails`/`sendDueEmails` and by the seed script.
- README: an "Email setup" section with the owner's steps: enable Gmail API and IAM Credentials API; grant the sync service account `roles/iam.serviceAccountTokenCreator` on itself; in Workspace Admin → Security → API controls → Domain-wide delegation add its client id with the two scopes; set `MAIL_SENDER`; deploy functions and rules.
- [ ] Step 1: Emulator test `seedTemplates only when empty`; `cd functions && npm run build && npm run test:emulator` PASS.
- [ ] Step 2: Commit `feat(email): callables, schedules, seed templates and setup notes`.

### Task 10: Web data layer

**Files:**
- Modify: `web/src/data/DataProvider.tsx`, `web/src/data/actions.ts`
- Create: `web/src/lib/emails.ts`, `web/src/lib/emails.test.ts`

**Interfaces:**
- DataProvider adds `templates: (EmailTemplate & { id })[]`, `emails: (EmailDoc & { id })[]`, `threads: (ThreadDoc & { id })[]`, `event: EventSettings | null`, `mailMeta: MailMeta | null` (listeners counted in `SOURCES`).
- actions: `saveTemplate(id | null, t, me): Promise<string>`, `deleteTemplate(id)`, `uploadTemplateAttachment(templateId, file): Promise<TemplateAttachment>` (Storage `emailAttachments/{templateId}/{Date.now()}-{name}`), `saveEvent(fields, me)`, and typed wrappers for each Task 9 callable.
- `lib/emails.ts`: `emailsBySpeaker(emails): Map<string, EmailDoc[]>` newest first; `stateLabel(e: EmailDoc): string` (`Sent 20 Nov` / `Bounced` / `Replied (2)` / `Scheduled 24 Nov, 09:00` / `Held: <reason>` / `May have been sent` / `Failed` / `Cancelled`), using `formatWhen`; `toIstanbulMs(date: string, time: string): number`; `lastDecisionEmail(history)`; `needsLook(e: EmailDoc, thread: ThreadDoc | undefined): boolean` (true when `thread.lastReplyAt > (thread.lastTeamAt ?? 0)`, or bounced, held or unknown); `latestLine(e, thread, firstName): string` (the mockup's activity line: `Priya replied · 19 Nov, 09:12 · <snippet>`, `Answered by the team · …`, `Not delivered · <reason>`, `Held · <reason>`, `Check Gmail Sent · …`, `Goes out <when>`, `No reply yet`).
- [ ] Step 1: Tests for `needsLook` (reply after team → true; team answered → false; bounced → true), `latestLine` each case, `stateLabel` each state, `toIstanbulMs('2026-12-05','09:00') === Date.UTC(2026,11,5,6,0)`, `emailsBySpeaker` order.
- [ ] Step 2: `cd web && npx vitest run && npx tsc -b`: PASS. Commit `feat(web): email data and actions`.

### Task 11: Emails section: Conversations, Templates, Event settings

**Files:**
- Create: `web/src/pages/EmailsPage.tsx`, `web/src/pages/TemplatesPage.tsx`, `web/src/pages/TemplateEditPage.tsx`, `web/src/pages/EventSettingsPage.tsx`, `web/src/components/EmailsTabs.tsx`, `web/src/components/Conversation.tsx` (the side panel, used here and in Task 13)
- Modify: `web/src/App.tsx` (routes `/emails`, `/emails/templates`, `/emails/templates/new`, `/emails/templates/:id`, `/emails/event`), `web/src/components/Nav.tsx` (an **Emails** item for everyone, after Logistics), `web/src/styles.css`

Screens (match `docs/mockups/2026-11-23-email/`; reuse `.title-row`, `.card`, `.settings/.setting` from Team, `.btn`):
- **Tabs** (`EmailsTabs`) above each page: Conversations, Templates, Event settings.
- **Conversations** (`emails.html`): filter buttons with counts (Needs a look default, All, Replied, Bounced, Scheduled); table Speaker (links to the talk page), Email and latest (`latestLine`), State (`stateLabel` chip), Sent (when, by); sorted by latest activity; row click opens `Conversation` for its thread; rows without a thread don't open; empty state "Nothing needs a look". Admin header buttons `Custom email` and `Send from a template`.
- **Conversation panel** (`talk.html` / `emails.html`): `role="dialog"`, Escape and scrim close it, focus moves in and returns to the row; loads `threads/{id}/messages` while open; our sends (from `EmailDoc.text`) and received messages in time order; `team` messages labelled "(from Gmail)"; quoted text behind `Show quoted text`; bounce as a notice; attachment chips download via `emailAttachment`; admin reply box (`Send reply` → `queueEmails` with `replyToThreadId`), hidden on a bounced thread.
- **Templates:** list rows: name, rule label (`Acceptance`, `Decline`, `Approved speakers`, `Anyone`), sent count, updated `by · formatWhen`. Admin: `New template`, row actions `Send…`, `Duplicate`, `Delete` (inline confirm like Team). Header link `Event settings`. Banner when `meta/mail.error` is set.
- **Template editor (admin; members see it read-only):** name, rule select, subject, body textarea, fill-in chips that insert at the cursor (speaker fill-ins + event keys), warnings for unknown fill-ins under the field (`fillInsIn` vs known), attachments list with upload/remove and the 20 MB total check, live preview beside the editor rendering with a chosen speaker (`renderEmail` + `fillInValues`), `Save` and `Send…`.
- **Event settings (admin; members read-only):** rows of label / key / value, add and remove, `validEventKey` errors inline, `Save`.
- [ ] Step 1: `cd web && npx tsc -b && npx vitest run && npx oxlint src` clean.
- [ ] Step 2: Commit `feat(web): templates and event settings`.

### Task 12: Send flow

**Files:**
- Create: `web/src/pages/SendPage.tsx` (routes `/emails/templates/:id/send` and `/emails/send?speaker=<key>&custom=1&followUp=1`)
- Modify: `web/src/App.tsx`, `web/src/styles.css`

Behaviour:
- Step 1 Recipients: speaker rows with checkbox, name, company, decision chip (`StatusChip`), "already got this" tag, eligibility reason when not eligible (disabled). Filters: decision (All, Approved, Declined, Not ready), Already got this (hide/show). Ineligible unticked. Tabs at top for decision templates: `Ready (n)`, `Needs a follow-up (n)` (each follow-up row has `Send follow-up…` that opens the single-speaker follow-up flow), `Not ready (n)`.
- First Acceptance send (no sent acceptance EmailDoc exists): a notice "Have some of these already been emailed outside the dashboard?" with `Mark selected as already emailed` (calls `markEmailed`).
- Step 2 Preview: steps through ticked recipients (← → buttons; not the meeting keys), shows To, Cc (with `Include co-speakers` toggle), Subject, body, attachments, flags. Blocked recipients listed with `missing`/`empty` fill-ins. `Send test to me`.
- Step 3 When: `Send now` or `Schedule` with date + time inputs labelled "Istanbul time"; confirm button text `Send to N speakers` / `Schedule for N speakers`. `batchId` = `crypto.randomUUID()` created when the page opens, so a double submit reuses it.
- After: per-recipient live state from `emails` (queued → sent/failed), with a link back.
- Custom (`custom=1`): subject/body fields replace the template, rule `anyone`, single speaker.
- [ ] Step 1: Verify `tsc`, tests, lint clean. Commit `feat(web): send flow with preview, test send and scheduling`.

### Task 13: Email history on the talk page, replies, meeting line

**Files:**
- Create: `web/src/components/EmailHistory.tsx` (uses `Conversation` from Task 11)
- Modify: `web/src/components/SpeakerPanel.tsx` (history section + `Email speaker` menu: template list, `Custom email`), `web/src/components/TalkHeader.tsx` (quiet line `Emailed: Acceptance · 20 Nov` from `lastDecisionEmail`), `web/src/styles.css`

Behaviour:
- History rows newest first: template name, `stateLabel` chip (neutral), by; `unknown` rows show "May have been sent, check Gmail Sent" with admin buttons `Mark as sent` / `Send again`; `scheduled` rows show `Cancel` and `Change time`; `failed` rows `Retry` (re-enqueue same content, new batch).
- A row with a thread opens the `Conversation` panel. `Email <first name>` opens a menu of templates (a follow-up tag where `needsFollowUp` applies) and `Custom email…`.
- [ ] Step 1: Verify `tsc`, tests, lint clean. Commit `feat(web): email history, conversations and replies on the talk page`.

### Task 14: Verify in the running app

- [ ] Step 1: Emulators (Java on PATH, see README) + seed + `npx vite --port 5173`. **One Chrome instance** for all checks (owner's rule), new tab per route.
- [ ] Step 2: As admin with the fake Gmail: edit Acceptance, set event values, send to two approved speakers; both show `Sent`; inject a reply and a bounce with `devInjectMail`, run `devRunMail`, see `Replied (1)` and `Bounced`; open the conversation and reply; schedule one email for 2 minutes ahead, change a status to pending, see it `Held`; double-click Send and confirm one email.
- [ ] Step 3: As member: templates read-only, history and conversation visible, no send controls.
- [ ] Step 4: Widths 1440, 1280, 1024, 390; projector view on the talk page unaffected.
- [ ] Step 5: All suites: `cd functions && npm test && npm run test:emulator`, `npm test` (rules), `cd web && npx vitest run && npx tsc -b && npx oxlint src`, `cd web && npx vite build`.
- [ ] Step 6: Commit any fixes; open the PR (owner pushes/merges; deploy only when the owner says "deploy").
