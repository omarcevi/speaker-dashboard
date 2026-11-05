# Advocu Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins upload Advocu CSV exports on the dashboard. Advocu applications become talk cards beside Form talks, and the same talk from both sources shows as one card.

**Architecture:** Parsing and planning are pure functions in `functions/src/advocu/`, called by a new admin-only callable `importAdvocu` with two modes, preview and apply. Imported documents live in `submissions` with `source: 'advocu'`. Sheet sync ignores them. The web app groups documents into **cards** when it displays them, using `buildCards`. Every page then works with cards instead of raw submissions. A card's id is its primary document's id, so reviews, scores and comments keep working unchanged.

**Tech Stack:** Firebase Cloud Functions 2nd gen (Node 22, europe-west1), Firestore, React 19 + Vite + TS, Vitest, Firebase emulators (`--project demo-cfp`).

**Spec:** `docs/superpowers/specs/2026-11-05-advocu-import-design.md`. Read it before starting any task.

## Global Constraints

- **No real personal data in the repo, tests, logs or docs.**
  - Never open, copy or commit the real Advocu export or the Form CSV in `~/Downloads`.
  - Fixtures are made-up rows with the real Advocu headers.
  - The repo is public, so don't include real names or counts anywhere.
- Never store the raw CSV text. Write only the parsed fields to Firestore.
- Advocu's `Status` never sets or changes a dashboard decision.
- Sheet sync must never mark `source: 'advocu'` documents removed, and must never feed them to the moved-row guard.
- Existing Form documents have no `source` field. Absent means `'form'`. Don't change `parseSheet` output, so Form `contentHash` values stay the same.
- `functions/src/model.ts` and `functions/src/talkKey.ts` stay free of value imports, because the web bundles them. Type-only imports are fine.
- Functions use `region: 'europe-west1'`, `serviceAccount: SYNC_SERVICE_ACCOUNT`, `timeoutSeconds: 300`, `memory: '512MiB'`.
- Emulators always run with `--project demo-cfp`. Java 21 needs `export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"`.
- Commit messages are plain. No `Co-Authored-By` or "Generated with" lines.
- "Nothing too fancy, the dashboard needs to just work."

## Review Focus

These five cases are the most likely to hurt real users. Each one is pinned by a test in the task named in brackets.

1. **A BOM, quoted commas and newlines.** An export re-saved by Excel starts with a UTF-8 BOM, and bios and abstracts contain quoted commas and newlines. It must parse into the right fields. [Task 2: `parses BOM, quoted commas and newlines`]
2. **The wrong file.** If an admin uploads the Form CSV or some other file by mistake, it is refused with a message naming the missing columns, and nothing is written. [Task 2 refusal tests, plus Task 4 `refused file writes nothing`]
3. **A filtered export.** An export containing only PENDING applications is uploaded. The preview warns that more than half would be hidden. If it's applied anyway, reviews stay put. Re-uploading the full export restores every card with its reviews. [Task 3 `warns when more than half would be hidden`, plus Task 4 `hide then restore keeps reviews`]
4. **Sheet sync after an import.** Sync never hides Advocu talks and never pauses with "Rows moved" because of them. [Task 4 `sheet sync ignores advocu docs`]
5. **An old link to a merged duplicate.** A bookmarked `/talk/advocu-…` link to an application that has since merged into a Form card opens that card. [Task 5 `cardFor finds a card by member id`]

---

### Task 1: Data model, talk keys and Advocu field mapping

**Files:**
- Modify: `functions/src/model.ts`
- Create: `functions/src/talkKey.ts`, `functions/src/advocu/mapFields.ts`
- Test: `functions/test/talkKey.test.ts`, `functions/test/mapFields.test.ts`

**Interfaces:**
- Produces, in `model.ts`:
  - `export type Source = 'form' | 'advocu'`
  - `export interface AdvocuDetails { creationDate: string; status: string; eligible: string; country: string; city: string; sessionTypes: string; sessionLength: string; participation: string; languages: string; levels: string; topics: string; cfpTitle: string }`
  - `SubmissionData` gains the optional fields `source?: Source` and `advocu?: AdvocuDetails`.
  - `export interface ImportSummary { mode: 'preview' | 'apply'; total: number; added: number; updated: number; unchanged: number; restored: number; hidden: number; merged: number; speakers: number; rematched: number; cfpTitles: string[]; rejected: { row: number; reason: string }[]; warnings: string[] }`
  - `export interface AdvocuMeta { lastImportAt?: Ts | null; byName?: string; total?: number; added?: number; updated?: number; hidden?: number; error: string | null; lastErrorAt?: Ts | null }` (this is `meta/advocu`)
- Produces, in `talkKey.ts`:
  - `titleKey(title: string): string`
  - `talkKey(speakerKey: string, title: string): string | null`. Returns `null` when `titleKey` is `''`.
- Produces, in `mapFields.ts`:
  - `topicGroupFor(topics: string): string`
  - `languageFor(languages: string): string`
  - `levelFor(levels: string): string`

- [ ] **Step 0: Branch and record the work already done.**
  - Rename the current branch: `git branch -m fix/sync-memory feat/advocu-import`.
  - Commit `functions/src/index.ts` with the message `fix(functions): give sync functions 512 MiB`. That memory change is already deployed.
  - Commit the spec and this plan with the message `docs: advocu import design and plan`.

- [ ] **Step 1: Write the failing tests**

```ts
// talkKey.test.ts
expect(titleKey('  Building Agents: A Guide! ')).toBe('building agents a guide');
expect(titleKey('İstanbul’da Flutter')).toBe(titleKey('istanbul da flutter'));
expect(titleKey('Kotlin ❤️ Compose')).toBe('kotlin compose');
expect(talkKey('a@x.com', 'Hello, World')).toBe('a@x.com|hello world');
expect(talkKey('a@x.com', '  ')).toBeNull();

// mapFields.test.ts
expect(topicGroupFor('AI - Gemini, Cloud - Run')).toBe('Generative AI, LLMs & agents');
expect(topicGroupFor('Build with AI')).toBe('Generative AI, LLMs & agents');
expect(topicGroupFor('AI - Agentic AI')).toBe('Generative AI, LLMs & agents');
expect(topicGroupFor('Cloud - API Management')).toBe('Cloud / DevOps / Infrastructure'); // "Management" is not "agent"
expect(topicGroupFor('AI - TPU, AI - TorchTPU')).toBe('Artificial Intelligence / Machine Learning');
expect(topicGroupFor('Google Cloud - BigQuery')).toBe('Cloud / DevOps / Infrastructure');
expect(topicGroupFor('Firebase - Hosting')).toBe('Mobile Development');
expect(topicGroupFor('Web - Angular')).toBe('Web Development');
expect(topicGroupFor('UX / UI Design')).toBe('Product / Design / UX');
expect(topicGroupFor('DevFest, Google I/O Extended')).toBe('Other');
expect(topicGroupFor('')).toBe('Other');
expect(languageFor('English, Arabic')).toBe('English');
expect(languageFor('Turkish, English')).toBe('English, Turkish');
expect(languageFor('Turkish')).toBe('Turkish');
expect(languageFor('French, Hindi')).toBe('');
expect(levelFor('Advance')).toBe('Advanced');
expect(levelFor('Beginner')).toBe('Beginner');
expect(levelFor('Beginner, Intermediate, Advance')).toBe('Intermediate');
expect(levelFor('Advance, Beginner')).toBe('Advanced');
expect(levelFor('')).toBe('');
```

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `cd functions && npx vitest run test/talkKey.test.ts test/mapFields.test.ts`
  - Expected: FAIL, because the modules aren't found.

- [ ] **Step 3: Implement the functions.**
  - **`titleKey`:** run these steps in order:
    1. `normalize('NFD')`
    2. strip `\p{M}`
    3. `toLowerCase()`
    4. replace `ı` with `i`
    5. replace `[^\p{L}\p{N}]+` with `' '` (flag `gu`)
    6. trim
  - **`talkKey`:** returns `` `${speakerKey}|${titleKey(title)}` ``.
  - **`topicGroupFor`:**
    - Split on `,`, then trim each tag. The top level is the part before `' - '`.
    - Rule 1 matches any tag against `/\b(gemini|agents?|agentic|llms?|generative)\b/i`, or a top level of `Build with AI`.
    - Rules 2–7 follow the spec's table, in order.
  - **`languageFor`:**
    - Keep only `English` and `Turkish`, case-insensitively.
    - With both, return `'English, Turkish'`.
  - **`levelFor`:**
    - Map `advance` (case-insensitive) to `Advanced`.
    - With one value, return it.
    - With several, return `Intermediate` if present, otherwise the first.
  - Add the model types exactly as listed under Interfaces.

- [ ] **Step 4: Run the tests and the build.**
  - Run: `cd functions && npx vitest run test/talkKey.test.ts test/mapFields.test.ts && npm run build`
  - Expected: PASS, and a clean `tsc`.

- [ ] **Step 5: Commit** with the message `feat(functions): talk keys and advocu field mapping`.

---

### Task 2: CSV parser and `parseAdvocu`

**Files:**
- Create:
  - `functions/src/advocu/csv.ts`
  - `functions/src/advocu/parseAdvocu.ts`
  - `functions/src/testing/fakeAdvocu.ts`
- Test: `functions/test/csv.test.ts`, `functions/test/parseAdvocu.test.ts`

**Interfaces:**
- Consumes from Task 1: `topicGroupFor`, `languageFor`, `levelFor`, `AdvocuDetails`, `SubmissionData`.
- Produces:
  - `parseCsv(text: string): string[][]`
  - `export const ADVOCU_HEADERS: readonly string[]`. These are the 26 headers from the spec, in order.
  - `export class ImportRefused extends Error {}`
  - `export interface ParsedAdvocu { applications: SubmissionData[]; cfpTitles: string[]; rejected: { row: number; reason: string }[] }`
  - `parseAdvocu(text: string): ParsedAdvocu`. It throws `ImportRefused`.
  - `advocuId(email: string, creationIso: string): string`
  - In `fakeAdvocu.ts`:
    - `fakeAdvocuCsv(rows?: Partial<Record<string, string>>[]): string`. Keys are header names, and the result is quoted CSV text with CRLF line endings.
    - `FAKE_ADVOCU_ROWS`: the default rows. They include one row with `Speaker email: 'ada@example.com'` and `Proposal title: 'Fake Talk Two'`, which matches fake Form row 3. They also include one Advocu-only speaker, `grace@example.com`, with two talks. All names and emails are made up.

- [ ] **Step 1: Write the failing tests**

```ts
// csv.test.ts
expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
expect(parseCsv('﻿a,"b, c","say ""hi""","l1\r\nl2"\n')).toEqual([['a', 'b, c', 'say "hi"', 'l1\r\nl2']]);
expect(parseCsv('a\n\n')).toEqual([['a']]); // trailing blank lines dropped

// parseAdvocu.test.ts
it('maps a row to an advocu submission', () => {
  const { applications } = parseAdvocu(fakeAdvocuCsv([{ 'Creation date': '2026-10-05T09:30:00.000Z', 'Speaker email': ' Grace@Example.com ',
    'Proposal title': 'Agents 101', 'Proposal topics': 'AI - Agents, Cloud - Run', 'Proposal languages': 'English, Arabic',
    'Audience level': 'Beginner, Advance', 'Status': 'PENDING' }]));
  const a = applications[0];
  expect(a.id).toBe(advocuId('grace@example.com', '2026-10-05T09:30:00.000Z'));
  expect(a.id).toMatch(/^advocu-[0-9a-f]{16}$/);
  expect(a).toMatchObject({ source: 'advocu', row: 0, timestamp: '2026-10-05T09:30:00.000Z', speakerKey: 'grace@example.com',
    email: 'Grace@Example.com', title: 'Agents 101', topicGroup: 'Generative AI, LLMs & agents', topic: 'AI - Agents, Cloud - Run',
    language: 'English', level: 'Beginner', phone: '', photoFileId: null, coSpeaker: null, noSession: false });
  expect(a.advocu).toMatchObject({ status: 'PENDING', languages: 'English, Arabic', levels: 'Beginner, Advance' });
  expect(a.contentHash).toMatch(/^[0-9a-f]{40}$/);
});
it('parses BOM, quoted commas and newlines', () => { /* bio 'Line one,\r\nline two' and a BOM-prefixed file give the exact bio */ });
it('finds columns by header name, not position', () => { /* fixture with the columns reversed parses the same */ });
it('refuses the Form CSV naming missing columns', () =>
  expect(() => parseAdvocu('Timestamp,First Name,Email,Session Title\r\nx,y,z,w\r\n')).toThrow(ImportRefused));
// The message must contain: Creation date, Speaker email, Proposal title, First name, Last name
it('refuses an export with no data rows', () => expect(() => parseAdvocu(fakeAdvocuCsv([]))).toThrow(/no applications/i));
it('refuses duplicate application keys', () => { /* two rows with the same email and creation date → ImportRefused /same application twice/ */ });
it('rejects a row with a bad date or missing email or title and keeps the rest', () => {
  // rows: valid; 'Creation date': 'yesterday'; 'Speaker email': ''
  // → applications.length 1; rejected [{ row: 3, reason: /creation date/i }, { row: 4, reason: /email/i }] (header is row 1)
});
it('collects distinct call-for-papers titles', () => { /* two rows with different 'Call for Papers title' → cfpTitles length 2 */ });
it('same answers give the same contentHash', () => { /* parse twice → equal hashes; change abstract → different */ });
```

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `cd functions && npx vitest run test/csv.test.ts test/parseAdvocu.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **`parseCsv`:** an RFC 4180 state machine.
    - Strip a leading BOM.
    - Accept both `\r\n` and `\n`.
    - Keep newlines that sit inside quotes.
    - Turn `""` into `"`.
    - Drop rows whose cells are all empty.
  - **Header lookup in `parseAdvocu`:**
    - Match headers on `trim().toLowerCase()`.
    - The required headers are `Creation date`, `Speaker email`, `Proposal title`, `First name` and `Last name`. If any are missing, throw `ImportRefused('This is not an Advocu export: missing columns <list>.')`.
    - If there are no data rows, throw `ImportRefused('The file has no applications.')`.
  - **Per row:**
    - Convert `Creation date` with `new Date(v)`. An invalid date rejects the row with `Creation date is not a date`. A valid one becomes `creationIso = d.toISOString()`.
    - A missing email rejects the row with `Speaker email is empty`.
    - A missing title rejects the row with `Proposal title is empty`.
    - A duplicate `advocuId` within the file throws `ImportRefused('The file lists the same application twice (row N and row M).')`.
  - **`advocuId`:** `'advocu-' + sha1(`${email.trim().toLowerCase()}|${creationIso}`).slice(0, 16)`.
  - **Field mapping** follows the spec's table:
    - Everything Advocu doesn't collect is `''`, `null` or empty objects.
    - `row` is `0`. `timestamp` is `creationIso`. `speakerKey` is the lower-cased, trimmed email.
  - **`contentHash`:** sha1 of `JSON.stringify` of the data, leaving out `id` and `row`.

- [ ] **Step 4: Run the tests.**
  - Run: `cd functions && npx vitest run test/csv.test.ts test/parseAdvocu.test.ts && npm run build`
  - Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(functions): parse advocu exports`.

---

### Task 3: `planImport` (pure)

**Files:**
- Create: `functions/src/advocu/planImport.ts`
- Test: `functions/test/planImport.test.ts`

**Interfaces:**
- Consumes: `SubmissionData` and `ImportSummary` from Task 1, `talkKey` from Task 1, and `ParsedAdvocu['cfpTitles']`.
- Produces:
  - `export interface StoredDoc { id: string; source: 'form' | 'advocu'; contentHash: string; removedFromSheet: boolean; speakerKey: string; title: string }`
  - `export interface ImportPlan { upserts: SubmissionData[]; markRemoved: string[]; counts: Omit<ImportSummary, 'mode' | 'cfpTitles' | 'rejected'> }`
  - `planImport(incoming: SubmissionData[], stored: StoredDoc[], cfpTitles: string[]): ImportPlan`

- [ ] **Step 1: Write the failing tests.** Build the stored docs with a small local helper.

```ts
it('adds new, updates changed, skips unchanged');           // counts.added/updated/unchanged; upserts exclude unchanged
it('hides stored advocu docs missing from the export');     // markRemoved = [missing id]; counts.hidden 1
it('restores a hidden doc that reappears');                 // stored removedFromSheet true + same hash → upsert, counts.restored 1
it('never touches form docs');                              // stored form doc absent from incoming → not in markRemoved
it('re-matches by email + title when the key changed');     // stored advocu-A (missing), incoming advocu-B same speaker+title
                                                            // → upsert has id advocu-A, counts.rematched 1, hidden 0
it('does not re-match when two stored docs share speaker+title'); // ambiguous → keep new id, both stored hidden
it('counts merges with non-removed form docs');             // incoming talkKey equals a form doc's → counts.merged 1; removed form doc → 0
it('counts distinct speakers');                             // counts.speakers
it('warns when more than half would be hidden');            // 3 stored, 2 missing → warnings[0] matches /2 of 3/
it('warns on more than one call for papers');               // cfpTitles ['A','B'] → warning mentions both titles
```

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `cd functions && npx vitest run test/planImport.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement `planImport`** using the spec's "Identity and matching" and "Import flow" rules.
  - The re-match pool is stored Advocu docs that are not matched by id in this import.
  - A re-match happens only when exactly one pool doc has the same `talkKey`.
  - `total` is `incoming.length`.

- [ ] **Step 4: Run the tests.**
  - Run: `cd functions && npx vitest run test/planImport.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(functions): plan advocu imports`.

---

### Task 4: Apply the import, the callable, sheet-sync scoping and rules

**Files:**
- Create: `functions/src/advocu/applyImport.ts`
- Modify:
  - `functions/src/index.ts`: export `importAdvocu`
  - `functions/src/sync/applySync.ts`: plan only Form docs
- Test:
  - `functions/test/applyImport.emulator.test.ts`
  - `functions/test/applySync.emulator.test.ts`: add a case
  - `tests/rules/firestore.rules.test.ts`: add `meta/advocu` cases

**Interfaces:**
- Consumes: `parseAdvocu`, `ImportRefused` (Task 2); `planImport`, `StoredDoc` (Task 3); `requireRole` (existing).
- Produces:
  - `applyImport(db: Firestore, csv: string, opts: { apply: boolean; by: { uid: string; name: string }; now?: Date }): Promise<ImportSummary>`
  - The callable `importAdvocu`. Its request data is `{ csv: string; mode: 'preview' | 'apply' }` and it returns `ImportSummary`.

- [ ] **Step 1: Write the failing emulator tests**

```ts
// applyImport.emulator.test.ts (beforeEach clears submissions, reviews, scores, comments, meta; seeds fakeSheet via applySync)
it('preview writes nothing');                 // submissions count unchanged, meta/advocu absent, summary.added === FAKE_ADVOCU_ROWS.length
it('apply writes advocu docs and meta/advocu'); // docs have source 'advocu', removedFromSheet false; meta/advocu { total, added, byName, error: null }
it('refused file writes nothing');            // applyImport(db, 'Timestamp,Email\r\n1,2\r\n', apply) rejects ImportRefused; nothing written
it('hide then restore keeps reviews');        // apply full; set reviews/scores/comments on one advocu id; apply without it → removedFromSheet true,
                                              // review data identical; apply full again → removedFromSheet false, review data identical
it('merge count sees the fake form talk');    // summary.merged === 1 (ada@example.com, 'Fake Talk Two')

// applySync.emulator.test.ts
it('sheet sync ignores advocu docs', async () => {
  // applyImport(full, apply) then applySync(fakeSheet()) twice
  // → every advocu doc still removedFromSheet false; applySync does not throw 'Rows moved'; result.removed === 0
});

// firestore.rules.test.ts
// member can read meta/advocu; waiting user cannot; admin cannot write meta/advocu
```

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `cd functions && npm run test:emulator`, then from the repo root run `npm test`. Stop any running emulators first.
  - Expected: the new cases FAIL.

- [ ] **Step 3: Implement.**
  - **`applyImport`:**
    - Parse the CSV.
    - Read `submissions` with `.select('source', 'contentHash', 'removedFromSheet', 'speakerKey', 'title')`. A doc with no `source` is a Form doc.
    - Run `planImport`.
    - In preview mode, return the summary and stop.
    - In apply mode:
      - Write in batches of up to 450: `set(doc, { ...s, removedFromSheet: false, syncedAt: now })` for upserts, and `update(doc, { removedFromSheet: true })` for `markRemoved`.
      - Then `meta/advocu.set({ lastImportAt, byName, total, added, updated, hidden, error: null }, { merge: true })`.
      - On a non-refusal error, `set({ error, lastErrorAt }, { merge: true })` and rethrow.
  - **`importAdvocu`:**
    - Use `onCall` with the shared options from Global Constraints.
    - Call `requireRole(uid, ['admin'])`.
    - Validate that `csv` is a non-empty string of at most 5,000,000 characters and that `mode` is `preview` or `apply`. Otherwise throw `HttpsError('invalid-argument', …)`.
    - Map `ImportRefused` to `HttpsError('invalid-argument', e.message)`.
    - Pass `by: { uid, name: user.name }`.
  - **`applySync`:** add `'source'` to the `.select` call, and drop docs where `source === 'advocu'` before `planSync`.
  - **Rules:** no change. `meta/{id}` already covers `meta/advocu`, and the new tests prove it.

- [ ] **Step 4: Run every functions suite.**
  - Run: `cd functions && npm test && npm run build && npm run test:emulator`, then from the repo root run `npm test`.
  - Expected: all PASS.

- [ ] **Step 5: Commit** with the message `feat(functions): importAdvocu callable; sheet sync leaves advocu docs alone`.

---

### Task 5: Cards (grouping) in the web app

**Files:**
- Create: `web/src/lib/cards.ts`, `web/src/lib/time.ts`
- Modify:
  - `web/src/data/DataProvider.tsx`
  - `web/src/lib/listView.ts`: date sort
  - `web/src/lib/speakers.ts`
  - `web/src/pages/ListPage.tsx`, `web/src/pages/MeetingPage.tsx`
- Test:
  - `web/src/lib/cards.test.ts`, `web/src/lib/time.test.ts`
  - `web/src/lib/listView.test.ts`: add a case

**Interfaces:**
- Consumes: `talkKey` from `functions/src/talkKey.ts`, plus `Source` and `AdvocuDetails`.
- Produces:
  - `export type Card = Submission & { sources: Source[]; memberIds: string[]; advocu: AdvocuDetails | null; possibleDuplicateOf: string[] }`
  - `buildCards(subs: Submission[], hasReviewData: (id: string) => boolean): Card[]`
  - `cardFor(cards: Card[], id: string): Card | undefined`. It matches by `id`, or by membership in `memberIds`.
  - `submittedAtMs(sub: Submission): number | null`
  - `useData()` gains `cards: Card[]` and `advocuMeta: AdvocuMeta | null`.
  - `otherTalks(cards: Card[], current: Card): Card[]`

- [ ] **Step 1: Write the failing tests.** Use `fakeSub` with `source` and `advocu` set as each case needs.

```ts
it('merges a form and an advocu doc with the same speaker and title');  // one card, id = form id, sources ['form','advocu'],
                                                                         // memberIds both, advocu = advocu doc's details, fields from form doc
it('a reviewed advocu doc is primary but shows form content');          // hasReviewData(advocu id) → card.id = advocu id, title/photo from form doc
it('two reviewed docs stay separate and point at each other');          // two cards, each possibleDuplicateOf = [other id]
it('a removed reviewed doc keeps its decision on the live card');        // removed advocu (reviewed) + live form same title → 1 card,
                                                                         // id = advocu id, removedFromSheet false, content from form doc
it('a group with every member removed is one removed card');            // both removed → 1 card, removedFromSheet true
it('different titles stay separate');                                    // same speaker, different titles → 2 cards
it('empty titles are never grouped');                                    // two noSession form rows same speaker → 2 cards
it('two form rows with the same title fold into the latest');           // no review data → one card, id = higher row
it('no-review advocu-only group uses the oldest advocu doc');           // two advocu same title → id = earlier timestamp
it('cardFor finds a card by member id');                                // cardFor(cards, advocuId) → the merged card

// time.test.ts — Form timestamps are M/D/YYYY H:MM:SS in Istanbul time (UTC+3)
expect(submittedAtMs(fakeSub({ id: 'row-2', row: 2, timestamp: '11/5/2026 9:05:00' }))).toBe(Date.UTC(2026, 10, 5, 6, 5, 0));
expect(submittedAtMs(fakeSub({ id: 'a', row: 0, source: 'advocu', timestamp: '2026-10-05T09:30:00.000Z' }))).toBe(Date.UTC(2026, 9, 5, 9, 30));
expect(submittedAtMs(fakeSub({ id: 'row-3', row: 3, timestamp: 'garbage' }))).toBeNull();

// listView.test.ts
it('date sort interleaves form and advocu by submission time, unknown times last');
```

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `npm test --prefix web`
  - Expected: FAIL.

- [ ] **Step 3: Implement `buildCards`.** Follow the spec's "Merged cards" section exactly.
  - Group every doc, removed or not, that has a non-null `talkKey`. Docs with a null `talkKey` become single cards.
  - The card is removed only when every member is removed.
  - The display doc is the latest present Form doc, then the latest present Advocu doc, then the primary.
  - Within a group:
    - If two or more members have review data, each member becomes a card, with `possibleDuplicateOf` set to the other members' ids.
    - Otherwise, choose the primary in this order: the one member with review data, then the latest Form doc by `row`, then the oldest Advocu doc by `timestamp`.
    - The card is `{ ...display, id: primary.id, removedFromSheet: allRemoved, sources, memberIds, advocu, possibleDuplicateOf: [] }`.
    - `advocu` comes from the Advocu primary if there is one, otherwise from the latest Advocu member.
  - **`submittedAtMs`:**
    - For Form docs, parse `/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/` as `Date.UTC(y, m-1, d, h-3, mi, s)`.
    - For Advocu docs, use `Date.parse`.
    - Return `null` for anything that doesn't parse.
  - **Date sort:** order by `submittedAtMs`, with nulls last. Break ties by `row`, then `id`.
  - **`DataProvider`:**
    - Add a `meta/advocu` listener. `SOURCES` becomes 6.
    - Compute `cards = useMemo(() => buildCards(submissions, id => reviews.has(id) || scores.has(id) || comments.has(id)), …)`.
  - **List page:** compute rows, counts and filter options from `cards`.
  - **Meeting page:**
    - Build rows, counts and balance from `cards`.
    - Look up the current card with `cardFor(cards, id)`.
    - If the card's id differs from the URL id, `navigate(`/talk/${card.id}?…`, { replace: true })`.
  - **`otherTalks`:** use cards.

- [ ] **Step 4: Run the tests and the build.**
  - Run: `npm test --prefix web && npm run build --prefix web`
  - Expected: PASS, and a clean build.

- [ ] **Step 5: Commit** with the message `feat(web): group form and advocu docs into cards`.

---

### Task 6: Card UI and logistics

**Files:**
- Create: `web/src/components/SourceBadge.tsx`, `web/src/components/AdvocuDetails.tsx`
- Modify:
  - `web/src/components/TalkPanel.tsx`
  - `web/src/pages/ListPage.tsx`
  - `web/src/lib/logistics.ts`
  - `web/src/pages/LogisticsPage.tsx`
- Test: `web/src/lib/logistics.test.ts`

**Interfaces:**
- Consumes: `Card` (Task 5).
- Produces:
  - `logisticsRows(cards: Card[], subs: Submission[], reviews: Map<string, Review>): LogisticsRow[]`
  - `LogisticsRow` gains `hasFormAnswers: boolean`.
  - The CSV gains a `Form answers` column right after `Talks`, holding `Yes` or `No`.

- [ ] **Step 1: Update and add the failing logistics tests.**
  - Change existing calls to `logisticsRows(cards, subs, reviews)`.
  - Update the header assertion to include `"Form answers"` after `"Talks"`.

```ts
it('takes logistics from the speaker’s latest form submission whatever its status');
  // approved advocu card + a pending form row (same speakerKey, different title, tshirt 'L') → speaker row tshirt 'L', hasFormAnswers true
it('approved advocu-only speaker gets a row with empty logistics and hasFormAnswers false');
it('a merged card counts once in talks');  // merged card → talks lists its title once
```

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `npm test --prefix web`
  - Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **`SourceBadge`:**
    - It renders `Form + Advocu` when `sources` has both, `Advocu` when it has only Advocu, and nothing otherwise.
    - Show it in the list row next to the title, and in the `TalkPanel` chips.
  - **`AdvocuDetails`:**
    - The heading is "Also on Advocu" when `sources` includes `form`, otherwise "From Advocu".
    - Its fields are session type, session length, in-person or virtual, country and city, languages, levels, topics, Advocu status, eligible, and call for papers. Skip empty ones.
    - Render it in `TalkPanel` below the abstract when `card.advocu` is set.
  - **Possible duplicates:** when `possibleDuplicateOf` is non-empty, `TalkPanel` shows the tag "Possible duplicate of" with links to `/talk/<id>`.
  - **Logistics page:**
    - Show a `No Form answers yet` tag for rows where `hasFormAnswers` is false.
    - Add the "Form answers" column.

- [ ] **Step 4: Run the tests and the build.**
  - Run: `npm test --prefix web && npm run build --prefix web`
  - Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(web): advocu badges, details and logistics from form answers`.

---

### Task 7: Import page, emulator seed and README

**Files:**
- Create: `web/src/pages/ImportPage.tsx`
- Modify:
  - `web/src/App.tsx`: route `/import`, admin-only like `/team`
  - `web/src/components/Nav.tsx`: an "Import" link for admins
  - `functions/scripts/seed-emulator.ts`
  - `README.md`

**Interfaces:**
- Consumes: the `importAdvocu` callable (Task 4), `useData().advocuMeta` (Task 5), `ImportSummary` and `AdvocuMeta` (Task 1), `fakeAdvocuCsv` (Task 2).

- [ ] **Step 1: Build `ImportPage`.**
  - It shows the last import line from `advocuMeta`: "Last import: <date> by <name> — <total> applications", or "No Advocu import yet".
  - It has a file input with `accept=".csv,text/csv"`. Read the file with `file.text()`, then call `httpsCallable(functions, 'importAdvocu')({ csv, mode: 'preview' })`.
  - Show the preview:
    - the counts: new, updated, unchanged, restored, hidden, merged with Form talks, speakers
    - the call-for-papers titles
    - `warnings`, in a `.banner`
    - `rejected` rows, as "Row N: reason"
  - Show a confirm button with the text `Import <total> applications`. It calls `{ csv, mode: 'apply' }`, then shows the result.
  - Errors use the existing `inline-error` style. Disable both buttons while a call is running.
- [ ] **Step 2: Seed fake Advocu data.** In `seed-emulator.ts`, after `applySync`, call `applyImport(db, fakeAdvocuCsv(), { apply: true, by: { uid: 'seed', name: 'Seed' } })`.
- [ ] **Step 3: Update the README.**
  - Add an "Advocu applications" section:
    - Export from Advocu as CSV.
    - Upload it on the **Import** page and check the preview, especially the hidden count.
    - Never commit or share the export.
  - Correct owner step 4: only the response sheet needs sharing. Photos are links, and Drive files shared as "Anyone with the link" are copied.
- [ ] **Step 4: Browser smoke test on the emulators.**
  - Start the emulators, seed them, and run `npm run dev --prefix web`.
  - As `admin@example.com`, check:
    - Import shows the seeded last import.
    - Uploading a fake CSV built from `fakeAdvocuCsv()` and saved to the scratchpad previews correctly.
    - The list shows `Advocu` and `Form + Advocu` badges.
    - "Fake Talk Two" is a single card with an "Also on Advocu" block.
    - Logistics shows "No Form answers yet" for an approved Advocu-only speaker.
  - Expected: all checks pass. Then stop the servers.
- [ ] **Step 5: Run all gates.**
  - Run: `npm test --prefix web && npm run build --prefix web && cd functions && npm test && npm run build && npm run test:emulator && cd .. && npm test`
  - Expected: all PASS.
- [ ] **Step 6: Commit** with the message `feat(web): admin import page for advocu exports`.

---

### Task 8: Ship

- [ ] **Step 1: Final review.** Get a whole-branch review and fix what it finds.
- [ ] **Step 2: Deploy.** The owner asked to "push the exported values", which needs this live. Run: `npm run build --prefix web && npx firebase deploy --only functions,hosting --project speaker-dashboard-9c149 --non-interactive`
  - Expected: `syncNow`, `scheduledSync` and `importAdvocu` are ACTIVE at 512Mi, and the site serves the new bundle.
- [ ] **Step 3: Owner uploads the real export.**
  - The owner signs in as admin, opens **Import**, chooses the Advocu CSV, reads the preview and confirms.
  - The agent never opens or uploads the real file itself.
- [ ] **Step 4: Verify with counts only.**
  - `meta/advocu.error` is null.
  - The number of `source == 'advocu'` docs equals the preview total.
  - The Form talk that matches an Advocu application shows as one card, and its decision is unchanged.
- [ ] **Step 5: PR.** Push `feat/advocu-import` and open a PR to `main`, with no attribution lines.
