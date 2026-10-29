# Speaker Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A members-only Firebase web app where the DevFest Istanbul team reviews CFP submissions pulled from the Google Form's response sheet. It covers scoring, comments, Pending/Maybe/Approved/Declined decisions, a projected meeting mode, a logistics export, and team access approval.

**Architecture:** A Cloud Function reads the response sheet through the Sheets API, running as a dedicated service account with no key file. It upserts `submissions/*` by sheet row. Review data (statuses, scores, comments) lives in separate collections that sync never writes. A React + Vite SPA on Firebase Hosting reads Firestore live, and Firestore and Storage rules gate everything on the `users/{uid}.role` field.

**Tech Stack:** Firebase (Hosting, Auth with the Google provider, Firestore, Storage, Cloud Functions 2nd gen on Node 22, Cloud Scheduler), TypeScript, React 18+, Vite, react-router-dom, plain CSS, Vitest, @firebase/rules-unit-testing, Firebase Emulator Suite, googleapis.

**Spec:** `docs/superpowers/specs/2026-10-29-speaker-dashboard-design.md`. Read it before starting any task.

## Global Constraints

- **No email sending in v1.** No Gmail code, templates, Outbox or email history (spec: "Phase 2: Emails (parked)").
- **Commits:** plain messages. Never add a `Co-Authored-By: Claude` trailer or "Generated with Claude Code" (owner's global rule).
- **No real speaker data in the repo.** Tests and seeds use fake rows from `functions/src/testing/fakeRows.ts`. `.gitignore` ignores `*.csv`, `*-key.json` and `serviceAccount*.json`. Never copy `~/Downloads/DevFest Istanbul 2026 CFP - Form Responses 1.csv` into the project.
- **No service account key files anywhere.** Functions use the runtime service account via Application Default Credentials.
- **Sync writes only `submissions/*` and `meta/sync`** (plus `photos/*` in Storage). It never writes `reviews`, `scores`, `comments` or `users`.
- **Role checks are enforced in `firestore.rules`, `storage.rules` and the functions,** not only in the UI.
- **Status values are exactly** `pending | maybe | approved | declined`, labelled **Pending / Maybe / Approved / Declined**. A submission with no `reviews` doc is `pending`.
- **Roles are exactly** `waiting | member | admin | removed`.
- **Scores are integers 1–5,** one per user per submission.
- **Sync schedule is `every 15 minutes`.** Functions region is `europe-west1`. The functions runtime is Node `22`.
- **Firebase project: `speaker-dashboard-9c149`** (Blaze, billing connected). **Emulators and all tests always run with `--project demo-cfp`,** so they never touch real resources.
- **Nothing heavy:** React, react-router-dom, firebase and plain CSS. No UI component library, state library or CSS framework.
- **Rows marked `removedFromSheet` are hidden by default** and excluded from counts, balance and logistics.

## Review Focus

1. **A speaker edits their form response.** The sheet row updates in place and its Timestamp changes. Expected: the same submission is updated, with no duplicate, and its status, scores and comments are untouched. *(Task 3)*
2. **The Sheets API returns ragged rows** (trailing empty cells are omitted), or the sheet is missing a column. Expected: the import doesn't crash, missing fields are `''`, and missing columns are reported to admins. *(Task 2)*
3. **An admin approves the current talk while stepping through "Pending" in meeting mode.** Expected: Next goes to the next pending talk after it, not the first talk or one further on. Scoring while sorted by score must not reshuffle the sequence mid-meeting. *(Task 8)*
4. **An admin changes their own role** (demote or remove themselves). Expected: this is blocked in the rules and the UI, so the team can't lock itself out. *(Tasks 4, 11)*
5. **Logistics CSV with Turkish characters, commas, quotes and multi-line answers.** Expected: it opens in Excel and Google Sheets with "Türkiye", "İstanbul" and line breaks intact, one record per row. *(Task 10)*

---

## File Structure

```
.gitignore  .firebaserc  firebase.json  firestore.rules  firestore.indexes.json  storage.rules
package.json                      # root: firebase-tools, vitest, @firebase/rules-unit-testing; rules tests
README.md                         # setup + deploy (Task 13)
tests/rules/firestore.rules.test.ts
tests/rules/storage.rules.test.ts
functions/
  package.json  tsconfig.json  vitest.config.ts  .env.example
  src/model.ts                    # shared data types (web imports with `import type`)
  src/sheet/columns.ts            # FIELDS, header matching
  src/sheet/clean.ts              # link + Drive id normalization
  src/sheet/parseSheet.ts         # values[][] -> SubmissionData[]
  src/sync/planSync.ts            # pure diff
  src/sync/applySync.ts           # Firestore writes
  src/sync/runSync.ts             # read + apply + photos + error capture
  src/sync/readSheet.ts           # Sheets API
  src/photos/syncPhotos.ts        # Drive -> Storage (Task 12)
  src/access.ts                   # requireRole
  src/index.ts                    # syncNow, scheduledSync
  src/testing/fakeRows.ts         # HEADER_ROW, makeRow, fakeSheet
  scripts/seed-emulator.ts  scripts/make-admin.ts
  test/*.test.ts  test/*.emulator.test.ts
web/
  package.json  tsconfig.json  vite.config.ts  index.html  .env.example
  src/main.tsx  src/App.tsx  src/styles.css  src/firebase.ts
  src/auth/AuthProvider.tsx  src/auth/gate.ts
  src/data/DataProvider.tsx  src/data/actions.ts
  src/lib/status.ts  src/lib/scores.ts  src/lib/listView.ts  src/lib/sequence.ts
  src/lib/balance.ts  src/lib/speakers.ts  src/lib/logistics.ts  src/lib/team.ts
  src/pages/SignInPage.tsx  WaitingPage.tsx  ListPage.tsx  MeetingPage.tsx  LogisticsPage.tsx  TeamPage.tsx
  src/components/StatusChip.tsx  StatusCounts.tsx  BalanceRow.tsx  TalkPanel.tsx  SpeakerPanel.tsx
                 ScoreBar.tsx  DecisionBar.tsx  Comments.tsx  SpeakerPhoto.tsx  Nav.tsx  RefreshButton.tsx
  src/lib/*.test.ts
```

---

### Task 1: Repo scaffold, Firebase config, emulators

**Files:**
- Create: `.gitignore`, `.firebaserc`, `firebase.json`, `firestore.indexes.json`, `package.json`, `functions/package.json`, `functions/tsconfig.json`, `functions/vitest.config.ts`, `functions/.env.example`, `web/` (Vite React-TS template), `web/.env.example`, `functions/test/smoke.test.ts`
- Placeholder rules: `firestore.rules` and `storage.rules` deny everything (replaced in Tasks 4 and 12)

**Interfaces:**
- Produces: `npm test` (root) runs the rules tests under the emulator. `npm test --prefix functions` runs unit tests. `npm run test:emulator --prefix functions` runs `*.emulator.test.ts` under `firebase emulators:exec --only firestore,storage`. `npm test --prefix web` runs Vitest.

- [ ] **Step 1: Check Java.** Run `java -version`. Today it fails with "Unable to locate a Java Runtime", and the emulators need Java 21+. **Ask the owner** before installing (suggested: `brew install openjdk@21`, then follow brew's symlink note). Re-run `java -version` and expect a 21+ version.
- [ ] **Step 2: Scaffold.** Run `git init`. Write `.gitignore` covering `node_modules`, `dist`, `lib`, `.env`, `.env.*` except `.env.example`, `*.csv`, `*-key.json`, `serviceAccount*.json`, `.superpowers/`, `*-debug.log` and `.firebase/`. Set `.firebaserc` default to `speaker-dashboard-9c149`. Every emulator and test command passes `--project demo-cfp`. Create `web` with `npm create vite@latest web -- --template react-ts`. Write `functions/package.json` with `"engines": {"node": "22"}`, `"main": "lib/index.js"`, and deps `firebase-admin`, `firebase-functions`, `googleapis`, plus devDeps `typescript`, `vitest` and `tsx`.
- [ ] **Step 3: `firebase.json`.** Configure `hosting.public = "web/dist"` with an SPA rewrite `** → /index.html`. Point `functions.source` at `functions` with predeploy `npm --prefix functions run build`. Point `firestore.rules`/`indexes` and `storage.rules` at their files. Set emulators to auth 9099, firestore 8080, functions 5001, storage 9199, hosting 5000, and ui enabled.
- [ ] **Step 4: Write `functions/test/smoke.test.ts`** with `expect(1 + 1).toBe(2)`. Run `npm test --prefix functions` and `npm test --prefix web` (add Vitest to web). Expected: both PASS.
- [ ] **Step 5: Start the emulators.** Run `npx firebase emulators:start --only auth,firestore,storage --project demo-cfp`. Expected: the "All emulators ready" table prints. Stop them.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "chore: scaffold firebase project with web and functions"`

---

### Task 2: Data model and sheet parsing

**Files:**
- Create: `functions/src/model.ts`, `functions/src/sheet/columns.ts`, `functions/src/sheet/clean.ts`, `functions/src/sheet/parseSheet.ts`, `functions/src/testing/fakeRows.ts`
- Test: `functions/test/parseSheet.test.ts`, `functions/test/clean.test.ts`

**Interfaces:**
- Produces (`model.ts`). `Ts = { toMillis(): number }` is used for timestamps so both SDKs fit.
  ```ts
  export const STATUSES = ['pending','maybe','approved','declined'] as const; export type Status = typeof STATUSES[number];
  export const ROLES = ['waiting','member','admin','removed'] as const; export type Role = typeof ROLES[number];
  export interface CoSpeaker { firstName: string; lastName: string; bio: string; email: string; phone: string;
    linkedin: string; x: string; instagram: string; photoUrl: string }
  export interface Logistics { fromAbroad: string; abroadFrom: string; transport: string; accommodation: string; tour: string;
    outsideIstanbul: string; city: string; otherRequirements: string; tshirt: string; afterParty: string }
  export interface SubmissionData {
    id: string; row: number; timestamp: string; speakerKey: string;
    firstName: string; lastName: string; email: string; company: string; jobTitle: string; phone: string; bio: string; gde: string;
    links: { linkedin: string; x: string; instagram: string; github: string };
    photoUrl: string; photoFileId: string | null; speakingExperience: string; whyDevFest: string; anythingElse: string;
    topic: string; topicGroup: string; title: string; abstract: string; takeaways: string; level: string; language: string;
    presentedBefore: string; talkHistory: string; noSession: boolean;
    coSpeaker: CoSpeaker | null; logistics: Logistics;
    consent: { codeOfConduct: string; recording: string; personalData: string }; // '' = not answered
    contentHash: string }
  export interface Submission extends SubmissionData { removedFromSheet: boolean; syncedAt: Ts }
  export interface Review { status: Status; updatedAt: Ts; updatedBy: string; updatedByName: string }       // reviews/{submissionId}
  export interface StatusChange { from: Status; to: Status; by: string; byName: string; at: Ts }            // reviews/{id}/history/{auto}
  export interface Score { submissionId: string; uid: string; name: string; value: number; updatedAt: Ts }  // scores/{submissionId}__{uid}
  export interface Comment { submissionId: string; uid: string; name: string; text: string; createdAt: Ts; editedAt: Ts | null } // comments/{auto}
  export interface UserDoc { email: string; name: string; photoURL: string; role: Role; createdAt: Ts }      // users/{uid}
  export interface SyncResult { added: number; updated: number; removed: number; total: number; missingColumns: string[] }
  export interface SyncMeta extends SyncResult { lastSyncedAt: Ts; error: string | null; lastErrorAt: Ts | null } // meta/sync
  ```
- Produces (`columns.ts`): `type FieldKey` (the 49 keys below, in sheet order), `FIELDS: { key: FieldKey; header: string }[]` (exact original headers, trailing spaces included), `normalizeHeader(h: string): string`, `indexColumns(header: string[]): { index: Partial<Record<FieldKey, number>>; missing: FieldKey[] }`.
  The keys are: timestamp, firstName, lastName, email, company, jobTitle, phone, bio, gde, linkedin, x, instagram, github, photo, speakingExperience, whyDevFest, area, areaOther, title, abstract, takeaways, level, language, presentedBefore, talkHistory, hasCoSpeaker, coFirstName, coLastName, coBio, coEmail, coPhone, coLinkedin, coX, coInstagram, coPhoto, fromAbroad, abroadFrom, transport, accommodation, tour, outsideIstanbul, city, otherRequirements, tshirt, afterParty, anythingElse, codeOfConduct, recording, personalData. They map one-to-one to the spec's header list.
- Produces (`clean.ts`): `type LinkKind = 'linkedin'|'x'|'instagram'|'github'`, `normalizeLink(raw: string, kind: LinkKind): string`, `extractDriveFileId(url: string): string | null`.
- Produces (`parseSheet.ts`): `parseSheet(values: string[][]): { submissions: SubmissionData[]; missingColumns: FieldKey[] }`. `values[0]` is the header (sheet row 1), and `values[i]` is sheet row `i + 1`.
- Produces (`fakeRows.ts`): `HEADER_ROW: string[]` (= `FIELDS.map(f => f.header)`), `makeRow(o?: Partial<Record<FieldKey,string>>): string[]` (positional, filled with plausible fake defaults), `fakeSheet(): string[][]` (header plus about 12 fake rows: one speaker with 3 talks whose email differs only by case or spaces, one co-speaker talk, one "Other" topic, one no-session row, one row without consent, two from abroad).

- [ ] **Step 1: Write the failing tests** in `functions/test/parseSheet.test.ts`:
  ```ts
  const parse = (rows: string[][], header = HEADER_ROW) => parseSheet([header, ...rows]);
  it('first response is row 2 / id row-2', () => expect(parse([makeRow()]).submissions[0]).toMatchObject({ row: 2, id: 'row-2' }));
  it('matches headers ignoring trailing spaces, "?", and year', () => {
    const h = HEADER_ROW.map(x => x.replace('2026', '2027').trimEnd());
    expect(parse([makeRow({ whyDevFest: 'because' })], h).submissions[0].whyDevFest).toBe('because'); });
  it('ragged row: missing trailing cells become empty', () => {
    const s = parse([makeRow({ title: 'T' }).slice(0, 20)]).submissions[0];
    expect(s.consent).toEqual({ codeOfConduct: '', recording: '', personalData: '' }); expect(s.logistics.tshirt).toBe(''); });
  it('reports missing columns and still imports', () => {
    const i = HEADER_ROW.indexOf('Code of Conduct'); const drop = (r: string[]) => r.filter((_, j) => j !== i);
    const r = parse([drop(makeRow())], drop(HEADER_ROW)); expect(r.missingColumns).toEqual(['codeOfConduct']); expect(r.submissions).toHaveLength(1); });
  it('trims and groups by lowercased email', () => {
    const s = parse([makeRow({ firstName: 'Kaan ', email: ' Foo@Bar.com ' })]).submissions[0];
    expect(s.firstName).toBe('Kaan'); expect(s.speakerKey).toBe('foo@bar.com'); });
  it('blank email → speakerKey no-email:row-N', () => expect(parse([makeRow({ email: '' })]).submissions[0].speakerKey).toBe('no-email:row-2'));
  it('skips fully blank rows but keeps numbering', () => {
    const r = parse([HEADER_ROW.map(() => ''), makeRow()]).submissions; expect(r.map(s => s.row)).toEqual([3]); });
  it('no title → noSession', () => expect(parse([makeRow({ title: '  ' })]).submissions[0].noSession).toBe(true));
  it('Other area shows the other text, groups as Other', () =>
    expect(parse([makeRow({ area: 'Other (please specify)', areaOther: 'Runtime dev' })]).submissions[0]).toMatchObject({ topic: 'Runtime dev', topicGroup: 'Other' }));
  it('empty area → topicGroup Unspecified', () => expect(parse([makeRow({ area: '' })]).submissions[0].topicGroup).toBe('Unspecified'));
  it('coSpeaker only when name or email present', () => {
    expect(parse([makeRow({ coFirstName: '', coEmail: '' })]).submissions[0].coSpeaker).toBeNull();
    expect(parse([makeRow({ coFirstName: 'Rishi' })]).submissions[0].coSpeaker?.firstName).toBe('Rishi'); });
  it('contentHash stable for same row, changes on edit', () => {
    const a = parse([makeRow()]).submissions[0], b = parse([makeRow()]).submissions[0], c = parse([makeRow({ timestamp: 'x', abstract: 'edited' })]).submissions[0];
    expect(a.contentHash).toBe(b.contentHash); expect(c.contentHash).not.toBe(a.contentHash); });
  ```
  In `functions/test/clean.test.ts`, write table tests:
  - `normalizeLink`:
    - `('', 'x')` → `''`
    - `('https://www.x.com/a ', 'x')` → `'https://www.x.com/a'`
    - `('www.linkedin.com/in/a', 'linkedin')` → `'https://www.linkedin.com/in/a'`
    - `('@kaan', 'x')` → `'https://x.com/kaan'`
    - `('kaan', 'github')` → `'https://github.com/kaan'`
    - `('kaan', 'instagram')` → `'https://instagram.com/kaan'`
    - `('kaan', 'linkedin')` → `'https://www.linkedin.com/in/kaan'`
  - `extractDriveFileId`:
    - `'https://drive.google.com/open?id=ABC123'` → `'ABC123'`
    - `'https://drive.google.com/file/d/ABC123/view'` → `'ABC123'`
    - `'https://drive.google.com/open?id=A1, https://drive.google.com/open?id=B2'` → `'A1'`
    - `'https://drive.google.com/drive/folders/XYZ'` → `null`
    - `''` → `null`
- [ ] **Step 2: Run** `npm test --prefix functions`. Expected: FAIL (modules not found).
- [ ] **Step 3: Implement.**
  - `normalizeHeader` does `trim` → collapse whitespace → strip `\b20\d\d\b` → strip a trailing `?` → lowercase → trim.
  - `parseSheet` trims every cell, and reads `cells[i] ?? ''` so ragged rows work.
  - `contentHash` is the sha1 of `JSON.stringify` of the data, without `contentHash`.
  - `topic` comes from `area` (or from `areaOther || 'Other'` when area is `Other (please specify)`). `topicGroup` is `area`, `'Other'`, or `'Unspecified'`.
  - `photoFileId = extractDriveFileId(photo)`.
  - Write `fakeRows.ts` with obviously fake names and `@example.com` emails.
- [ ] **Step 4: Run** `npm test --prefix functions`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(sync): parse form response sheet into submissions"`. Run `git add` on the new files first.

---

### Task 3: Sync diff and Firestore apply

**Files:**
- Create: `functions/src/sync/planSync.ts`, `functions/src/sync/applySync.ts`
- Test: `functions/test/planSync.test.ts`, `functions/test/applySync.emulator.test.ts`

**Interfaces:**
- Consumes: `parseSheet`, `SubmissionData`, `SyncResult`, `fakeSheet`, `makeRow`, `HEADER_ROW`.
- Produces:
  - `planSync(incoming: SubmissionData[], existing: { id: string; contentHash: string; removedFromSheet: boolean }[]): { upserts: SubmissionData[]; markRemoved: string[]; added: number; updated: number }`
  - `applySync(db: Firestore, values: string[][], now?: Date): Promise<SyncResult>`. It writes only `submissions/{id}` (full doc + `removedFromSheet: false` + `syncedAt`), `removedFromSheet: true` on missing rows, and `meta/sync` (`SyncMeta` with `error: null`). Writes are batched in groups of 450 or fewer.

- [ ] **Step 1: Write the failing pure tests** in `planSync.test.ts`:
  - new id → in `upserts`, `added: 1`
  - same hash → nothing
  - **changed hash on same id (respondent edited, Timestamp changed) → one upsert with that id, `updated: 1`, `added: 0`**
  - existing id absent from incoming → `markRemoved: [id]`
  - already-removed id still absent → not in `markRemoved`
  - removed id reappears with the same hash → upserted, counted as `updated`
- [ ] **Step 2: Write the failing emulator test** in `applySync.emulator.test.ts`, using `initializeApp({ projectId: 'demo-cfp' })` and clearing Firestore in `beforeEach`:
  ```ts
  it('edit updates the same submission and never touches review data', async () => {
    await applySync(db, [HEADER_ROW, makeRow({ title: 'Old' }), makeRow({ email: 'b@example.com' })]);
    await db.doc('reviews/row-2').set({ status: 'approved', updatedBy: 'u1' });
    await db.doc('scores/row-2__u1').set({ submissionId: 'row-2', uid: 'u1', value: 4 });
    await db.doc('comments/c1').set({ submissionId: 'row-2', uid: 'u1', text: 'hi' });
    const before = await snapshotOf(['reviews/row-2', 'scores/row-2__u1', 'comments/c1']);
    const r = await applySync(db, [HEADER_ROW, makeRow({ title: 'New', timestamp: 'later' })]);
    expect(await snapshotOf(['reviews/row-2', 'scores/row-2__u1', 'comments/c1'])).toEqual(before);
    expect((await db.doc('submissions/row-2').get()).data()).toMatchObject({ title: 'New', removedFromSheet: false });
    expect((await db.doc('submissions/row-3').get()).data()).toMatchObject({ removedFromSheet: true });
    expect((await db.collection('submissions').get()).size).toBe(2);
    expect(r).toMatchObject({ added: 0, updated: 1, removed: 1, total: 1 });
    expect((await db.doc('meta/sync').get()).data()).toMatchObject({ error: null, total: 1 });
  });
  ```
  Here `snapshotOf` maps paths to `.data()`. `total` counts rows currently in the sheet.
- [ ] **Step 3: Run** `npm test --prefix functions && npm run test:emulator --prefix functions`. Expected: FAIL.
- [ ] **Step 4: Implement** `planSync`, then `applySync`. `applySync` reads `submissions` selecting only `contentHash` and `removedFromSheet`, then plans, then writes in batches, then writes `meta/sync`.
- [ ] **Step 5: Run both.** Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(sync): upsert submissions by row without touching review data"`

---

### Task 4: Firestore security rules

**Files:**
- Modify: `firestore.rules`
- Test: `tests/rules/firestore.rules.test.ts`

**Interfaces:**
- Produces: these access rules, which every later task relies on.
  - **`users/{uid}`:**
    - Read: yourself, or any member/admin.
    - Create: only yourself, only with `role == 'waiting'`, and keys limited to `email, name, photoURL, role, createdAt`.
    - Update: admin only, for **another** user's doc, changing only `role` to a value in `ROLES`.
    - Delete: never.
  - **`submissions/*` and `meta/*`:** members/admins can read. Nobody can write.
  - **`reviews/{id}`:** members can read. Admins can write when `status` is in `STATUSES`.
  - **`reviews/{id}/history/{h}`:** members can read. Admins can create. Nobody can update or delete.
  - **`scores/{sid}`:**
    - Read: members.
    - Create and update: allowed when `request.resource.data.uid == auth.uid`, `sid == request.resource.data.submissionId + '__' + auth.uid`, and `value` is an int from 1 to 5.
    - Delete: only your own score.
  - **`comments/{c}`:**
    - Read: members.
    - Create: your own `uid`, with `text` as a string of 1–5000 characters.
    - Update: your own comment, changing only `text` and `editedAt`.
    - Delete: your own comment.
  - "Member" means `role in ['member','admin']`, read through `get(/databases/$(database)/documents/users/$(request.auth.uid))`.

- [ ] **Step 1: Write the failing tests.** Use `initializeTestEnvironment({ projectId: 'demo-cfp', firestore: { rules } })`, and seed users with `withSecurityRulesDisabled`: `wait1` (waiting), `rem1` (removed), `mem1` (member), `adm1` (admin), plus `submissions/row-2`. Write one `it` per line, using `assertSucceeds`/`assertFails`:
  - **Signed-out:** reading `submissions/row-2` fails.
  - **`wait1`:**
    - Reading `submissions/row-2`, `reviews/row-2`, the `scores` and `comments` lists, and `meta/sync` all fail.
    - Reading its own user doc succeeds. Reading `users/mem1` fails.
    - Updating its own role to `member` fails.
  - **New user `new1`:**
    - Creating its own doc with `role: 'waiting'` succeeds.
    - Creating it with `role: 'admin'` fails.
    - Creating `users/other` fails.
  - **`rem1`:** reading `submissions/row-2` fails.
  - **`mem1`:**
    - Reading `submissions/row-2` succeeds.
    - Writing `submissions/row-2`, `reviews/row-2` or `meta/sync` fails.
  - **`mem1` scores:**
    - Setting `scores/row-2__mem1` to `{submissionId:'row-2', uid:'mem1', name:'M', value:4, updatedAt}` succeeds.
    - Values `0`, `6` and `3.5` fail.
    - Setting `scores/row-2__adm1` fails.
    - Setting `uid:'adm1'` on its own doc ID fails.
    - Deleting another user's score fails.
  - **`mem1` comments:**
    - Creating its own comment succeeds. Creating one with `uid:'adm1'` fails.
    - `text: ''` fails.
    - Editing `adm1`'s comment fails.
    - Deleting its own comment succeeds.
  - **`adm1`:**
    - Setting `reviews/row-2 {status:'approved', …}` succeeds. `status:'accepted'` fails.
    - Creating a history entry succeeds. `mem1` creating a history entry fails.
  - **`adm1` roles:**
    - Updating `users/mem1.role` to `admin` succeeds. Updating it to `superadmin` fails.
    - **Updating `users/adm1.role` (its own) to `member` fails.**
- [ ] **Step 2: Run** `npm test` (root). Expected: FAIL (the placeholder rules deny everything, so the success cases fail).
- [ ] **Step 3: Implement `firestore.rules`** as specified above.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(rules): role-gated firestore access"`

---

### Task 5: Cloud Functions: sync endpoints, role check, scripts

**Files:**
- Create: `functions/src/sync/readSheet.ts`, `functions/src/sync/runSync.ts`, `functions/src/access.ts`, `functions/src/index.ts`, `functions/scripts/seed-emulator.ts`, `functions/scripts/make-admin.ts`, `functions/.env.example`
- Test: `functions/test/access.emulator.test.ts`, `functions/test/runSync.emulator.test.ts`

**Interfaces:**
- Consumes: `applySync`, `fakeSheet`, `Role`, `SyncResult`.
- Produces:
  - `readSheet(sheetId: string, tab: string): Promise<string[][]>`. Uses `google.sheets('v4').spreadsheets.values.get({ range: \`'${tab}'\` })` with `GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })`.
  - `requireRole(uid: string | undefined, roles: Role[]): Promise<UserDoc>`. Throws `HttpsError('unauthenticated')` when there's no uid, and `HttpsError('permission-denied')` when the role isn't allowed or there's no user doc.
  - `runSync(db: Firestore, read: () => Promise<string[][]>, opts?: { now?: Date; photos?: (subs: SubmissionData[]) => Promise<unknown> }): Promise<SyncResult>`.
    - On a thrown error it merges `{ error: message, lastErrorAt: now }` into `meta/sync`, leaving `lastSyncedAt` as the last *successful* sync, and rethrows.
    - On success, `applySync` has already set `error: null`.
    - `photos` is used from Task 12. It receives `parseSheet(values).submissions`.
  - **Emulator-only fake sheet:** when `process.env.FUNCTIONS_EMULATOR === 'true'` and `SHEET_ID === 'fake'`, `read` returns `fakeSheet()`, so the Refresh button works locally.
  - The functions in `index.ts` all use `region: 'europe-west1'` and `serviceAccount: SYNC_SERVICE_ACCOUNT`. Params are `defineString('SHEET_ID')`, `defineString('SHEET_TAB', { default: 'Form Responses 1' })` and `defineString('SYNC_SERVICE_ACCOUNT')`.
    - `syncNow = onCall(...)`: calls `requireRole(request.auth?.uid, ['member','admin'])`, then `runSync`, and returns `SyncResult`.
    - `scheduledSync = onSchedule({ schedule: 'every 15 minutes', ... })`: calls `runSync`.
  - `seed-emulator.ts`: `applySync(db, fakeSheet())`, then creates `users/{uid}` docs for the emulator auth users it creates (`admin@example.com` as admin, `member@example.com` as member, `waiting@example.com` as waiting).
  - `make-admin.ts <email>`: finds `users` where `email == arg` (exactly one) and sets `role: 'admin'`. Exits non-zero with "Sign in to the dashboard once first" if none is found. Run with `npx tsx scripts/make-admin.ts you@x.com`.

- [ ] **Step 1: Write the failing emulator tests.**
  - `requireRole`:
    - `undefined` → rejects with code `unauthenticated`.
    - A `waiting` user → `permission-denied`.
    - A `removed` user → `permission-denied`.
    - A `member` with `['member','admin']` → resolves with the doc.
    - A `member` with `['admin']` → `permission-denied`.
  - `runSync`:
    - A reader that throws `new Error('403 caller does not have permission')` → rejects, `meta/sync.error` contains `'403'`, and `lastSyncedAt` is unchanged from the previous successful run.
    - A reader returning `fakeSheet()` afterwards → `meta/sync.error === null`.
- [ ] **Step 2: Run** `npm run test:emulator --prefix functions`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above. `.env.example` lists `SHEET_ID=`, `SHEET_TAB=Form Responses 1` and `SYNC_SERVICE_ACCOUNT=cfp-sync@<project>.iam.gserviceaccount.com`. Add `functions/.env.local` with `SHEET_ID=fake` for the emulator; it's gitignored.
- [ ] **Step 4: Run.** Expected: PASS. Then run `npm run build --prefix functions`. Expected: no TS errors.
- [ ] **Step 5: Smoke-test the seed.** Start the emulators (`auth,firestore,functions,storage`), then run `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/seed-emulator.ts`. Expected: the Emulator UI shows about 12 `submissions`, `meta/sync` and 3 users.
- [ ] **Step 6: Commit.** `git commit -m "feat(functions): syncNow and scheduled sync with role checks"`

---

### Task 6: Web shell: Firebase init, sign-in, access gate, live data

**Files:**
- Create: `web/src/firebase.ts`, `web/src/auth/AuthProvider.tsx`, `web/src/auth/gate.ts`, `web/src/data/DataProvider.tsx`, `web/src/pages/SignInPage.tsx`, `web/src/pages/WaitingPage.tsx`, `web/src/components/Nav.tsx`, `web/src/styles.css`, `web/.env.example`
- Modify: `web/src/App.tsx`, `web/src/main.tsx`
- Test: `web/src/auth/gate.test.ts`

**Interfaces:**
- Consumes: `import type { ... } from '../../functions/src/model'` (type-only imports; add `../functions/src/model.ts` to web `tsconfig` `include`).
- Produces:
  - `firebase.ts` exports `app`, `auth`, `db`, `storage` and `functions` (region `europe-west1`). It connects to the emulators when `import.meta.env.VITE_USE_EMULATORS === 'true'`. Config comes from `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET` and `VITE_FIREBASE_APP_ID`.
  - `gate(auth: 'loading'|'signedOut'|'signedIn', role: Role | null): 'loading'|'signin'|'waiting'|'removed'|'app'`.
  - `useAuth(): { user: User | null; me: (UserDoc & { uid: string }) | null; state: 'loading'|'signedOut'|'signedIn'; signIn(): Promise<void>; signOut(): Promise<void> }`. After sign-in it creates `users/{uid}` with `role: 'waiting'` if missing, then subscribes to it.
  - `useData(): { submissions: Submission[]; reviews: Map<string, Review>; scores: Map<string, Score[]>; comments: Map<string, (Comment & { id: string })[]>; sync: SyncMeta | null; loading: boolean }`. It subscribes with `onSnapshot` only when the role is `member` or `admin`. Each submission carries its doc id.
  - Routes: `/` → ListPage, `/talk/:id` → MeetingPage, `/logistics`, `/team` (admin only, otherwise redirect `/`).

- [ ] **Step 1: Write the failing test** `gate.test.ts`:
  - `('loading', null)` → `'loading'`
  - `('signedOut', null)` → `'signin'`
  - `('signedIn', null)` → `'loading'` (user doc not loaded yet)
  - `('signedIn', 'waiting')` → `'waiting'`
  - `('signedIn', 'removed')` → `'removed'`
  - `('signedIn', 'member')` → `'app'`
  - `('signedIn', 'admin')` → `'app'`
- [ ] **Step 2: Run** `npm test --prefix web`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
  - `WaitingPage` copy:
    - For `waiting`: "Thanks, an admin needs to approve your access."
    - For `removed`: "Your access to this dashboard was removed."
    - Both show a Sign out button.
  - `Nav` links: Submissions, Logistics, and Team (admins only), plus the user's name and Sign out.
  - `styles.css` defines CSS variables for the four status colors and a base font of 16px.
- [ ] **Step 4: Run** `npm test --prefix web`. Expected: PASS.
- [ ] **Step 5: Manual check.** Run the emulators plus seed, then `VITE_USE_EMULATORS=true npm run dev --prefix web`. Check each account:
  - A new Google account in the auth emulator → Waiting screen.
  - `member@example.com` → Nav visible, Team link hidden.
  - `admin@example.com` → Team link visible.
- [ ] **Step 6: Commit.** `git commit -m "feat(web): sign-in, approval gate, live data provider"`

---

### Task 7: Submissions list

**Files:**
- Create: `web/src/lib/status.ts`, `web/src/lib/scores.ts`, `web/src/lib/listView.ts`, `web/src/pages/ListPage.tsx`, `web/src/components/StatusChip.tsx`, `web/src/components/RefreshButton.tsx`
- Test: `web/src/lib/status.test.ts`, `web/src/lib/scores.test.ts`, `web/src/lib/listView.test.ts`

**Interfaces:**
- Consumes: `useData`, `useAuth`, model types.
- Produces:
  - `statusOf(reviews: Map<string, Review>, id: string): Status`
  - `statusCounts(subs: Submission[], reviews: Map<string, Review>): Record<Status | 'all', number>`. Excludes `removedFromSheet`.
  - `interface ScoreSummary { mine: number | null; revealed: boolean; count: number; avg: number | null; min: number | null; max: number | null; entries: { name: string; value: number }[] }`
  - `summarizeScores(scores: Score[], myUid: string, showAll: boolean): ScoreSummary`. `revealed = mine !== null || showAll`. When not revealed, `avg`, `min` and `max` are null and `entries` is `[]`, but `count` is still shown. `avg` is rounded to 1 decimal place, and `entries` are sorted by name.
  - `interface ListRow { sub: Submission; status: Status; score: ScoreSummary; commentCount: number; otherTalkCount: number }`
  - `buildRows(subs, reviews, scores: Map<string, Score[]>, comments: Map<string, unknown[]>, myUid: string, showAll: boolean): ListRow[]`
  - `interface ListFilter { status: Status | 'all'; topic: string | null; level: string | null; language: string | null; q: string; showRemoved: boolean }`, `type SortKey = 'score' | 'spread' | 'date'`
  - `applyFilter(rows: ListRow[], f: ListFilter): ListRow[]`, `sortRows(rows: ListRow[], key: SortKey): ListRow[]`
  - `readQuery(p: URLSearchParams): { filter: ListFilter; sort: SortKey }` and `writeQuery(filter: ListFilter, sort: SortKey): URLSearchParams`. Defaults are omitted from the URL. The defaults are `status 'all'`, `sort 'date'` and `showRemoved false`.
  - `searchKey(s: string): string`: `toLocaleLowerCase('tr')` → NFD → strip `\p{M}` → `ı`→`i`.

- [ ] **Step 1: Write the failing tests.**
  - `statusCounts`:
    - A sub with no review counts as pending.
    - A removed sub is excluded from every count, including `all`.
  - `summarizeScores` (scores `[A:4, B:5, C:4]`):
    - As outsider `X` with `showAll false` → `{ revealed:false, count:3, avg:null, entries:[] }`.
    - As `A` → `{ revealed:true, mine:4, avg:4.3, min:4, max:5 }`.
    - As `X` with `showAll true` → revealed.
    - No scores → `count 0, avg null`.
  - `sortRows`:
    - `'score'`: revealed rows by avg descending, then unrevealed rows last by `row` ascending.
    - `'spread'`: `max - min` descending, unrevealed last.
    - `'date'`: `row` ascending.
  - `applyFilter`:
    - `status:'pending'` includes subs with no review.
    - Removed subs are hidden unless `showRemoved`.
    - `topic` matches `topicGroup`.
    - `q:'kapici'` matches last name `'KAPICI'`, and `q:'izmir'` matches company `'İzmir Yazılım'`.
  - `readQuery(writeQuery(f, s))` round-trips a non-default filter, and `writeQuery(defaults).toString() === ''`.
- [ ] **Step 2: Run** `npm test --prefix web`. Expected: FAIL.
- [ ] **Step 3: Implement the libs and `ListPage`.**
  - **Columns:** status chip, title (`"No session"` tag when `noSession`), speaker, `+N other talks`, topic, level, language, average score, spread, and comment count.
  - **Controls:** the filter and sort controls read and write the URL query string. A "Show all team scores" checkbox persists in `localStorage['showAllScores']`, wrapped in try/catch.
  - **Rows:** clicking a row navigates to `/talk/:id?<same query>`.
  - **`RefreshButton`:** calls the `syncNow` callable and shows "Last synced …" from `sync.lastSyncedAt`. For **admins** it also shows:
    - `sync.error` and `missingColumns`, if any.
    - The note: "Don't sort or delete rows in the Form Responses tab; use filter views."
- [ ] **Step 4: Run tests.** Expected: PASS. Manual check against the seeded emulator:
  - Filters, sort and search work, and they survive a page reload because they live in the URL.
  - Refresh updates "Last synced".
- [ ] **Step 5: Commit.** `git commit -m "feat(web): submissions list with filters, sort, scores reveal"`

---

### Task 8: Meeting mode: layout and navigation

**Files:**
- Create: `web/src/lib/sequence.ts`, `web/src/lib/balance.ts`, `web/src/lib/speakers.ts`, `web/src/pages/MeetingPage.tsx`, `web/src/components/StatusCounts.tsx`, `web/src/components/BalanceRow.tsx`, `web/src/components/TalkPanel.tsx`, `web/src/components/SpeakerPanel.tsx`, `web/src/components/SpeakerPhoto.tsx` (`SpeakerPhoto({ fileId, url }: { fileId: string | null; url: string })`, link-only for now)
- Test: `web/src/lib/sequence.test.ts`, `web/src/lib/balance.test.ts`, `web/src/lib/speakers.test.ts`

**Interfaces:**
- Consumes: `buildRows`, `applyFilter`, `sortRows`, `readQuery`, `writeQuery`, `statusCounts`, `statusOf`.
- Produces:
  - `neighbors(order: string[], inFilter: (id: string) => boolean, currentId: string): { prev: string | null; next: string | null; position: number | null; total: number }`.
    - `prev` and `next` are the nearest ids before and after `currentId` in `order` that pass `inFilter`.
    - `position` is the 1-based index of `currentId` among the passing ids, or `null` if `currentId` doesn't pass.
    - If `currentId` isn't in `order`, `prev = null` and `next` is the first passing id.
  - `interface Count { label: string; n: number }`, `approvedBalance(subs: Submission[], reviews: Map<string, Review>): { topic: Count[]; language: Count[]; level: Count[] }`. Counts approved talks only, excluding `removedFromSheet` and `noSession`. Topic uses `topicGroup`. Sorted by `n` descending, then label.
  - `otherTalks(subs: Submission[], current: Submission): Submission[]`. Same `speakerKey`, excluding `current` and removed rows, sorted by `row`.
  - **The meeting order is a snapshot.** `MeetingPage` computes `order` (ids after the non-status filters and the sort, ignoring status) **once on mount and whenever the query string changes**. Live data changes don't recompute it. Status membership is evaluated live, through `statusOf`, via `inFilter`.

- [ ] **Step 1: Write the failing tests.**
  - `neighbors` (`order = ['a','b','c','d','e']`):
    - `inFilter = {a,c,e}` at `'c'` → `{prev:'a', next:'e', position:2, total:3}`.
    - **`'c'` just approved, so `inFilter = {a,e}`** → `{prev:'a', next:'e', position:null, total:2}`.
    - At `'e'` → `next: null`.
    - `currentId: 'z'` → `{prev:null, next:'a'}`.
  - `approvedBalance`:
    - Two approved GenAI talks and one declined GenAI talk → GenAI `n: 2`.
    - An approved removed talk or an approved noSession talk isn't counted.
    - An "Other" talk counts under `'Other'`.
  - `otherTalks`: returns the speaker's two other talks in row order, excluding a removed one.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the libs and the meeting layout** (the approved mockup "A" with B's status counts; spec §Screens 2):
  - **Top bar:** `StatusCounts`, where clicking a chip rewrites `status` in the URL, which recomputes the order. Then Prev and Next, and `"{position} of {total} {status}"`, or `"— of {total}"` when `position` is null.
  - **`BalanceRow`:** topic, language and level counts.
  - **`TalkPanel` (left, wider):** chips (status, topic, level, language, presented before), title, abstract, key takeaways, talk history, co-speaker block, and a comments slot (Task 9).
  - **`SpeakerPanel` (right):**
    - `SpeakerPhoto` (for now an "Open photo ↗" link to `photoUrl`), name, job title · company, link chips for non-empty `links`, GDE, and city/country.
    - Speaking experience, then collapsible Bio, "Why DevFest Istanbul" and "Anything to tell us".
    - Consent chips, showing "not answered" for `''`.
    - `otherTalks` with status chips, linking to `/talk/:id?<query>`.
  - **Bottom bar slot:** for `ScoreBar` and `DecisionBar` (Task 9).
  - **Keyboard:** ArrowLeft and ArrowRight navigate, except when `event.target` is an `input`, `textarea` or `[contenteditable]`.
  - **Readability:** meeting mode uses a base font of 18px.
  - **Back link:** "← List" goes back with the same query.
- [ ] **Step 4: Run tests.** Expected: PASS. Manual check:
  - Open a talk from the list. The arrows step within the list's filter and sort.
  - Clicking "Pending" restricts stepping to pending talks.
  - A speaker's other talks are clickable.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): meeting mode layout and navigation"`

---

### Task 9: Meeting mode: scoring, decisions, comments

**Files:**
- Create: `web/src/data/actions.ts`, `web/src/components/ScoreBar.tsx`, `web/src/components/DecisionBar.tsx`, `web/src/components/Comments.tsx`
- Modify: `web/src/pages/MeetingPage.tsx`, `web/src/components/TalkPanel.tsx`

**Interfaces:**
- Consumes: `summarizeScores`, `statusOf`, `useAuth().me`, and the Task 4 rule shapes.
- Produces (`actions.ts`, where `me = { uid: string; name: string }`):
  - `setScore(submissionId: string, value: 1|2|3|4|5 | null, me): Promise<void>`. `null` deletes `scores/{submissionId}__{uid}`.
  - `setStatus(submissionId: string, from: Status, to: Status, me): Promise<void>`. A single `writeBatch` that sets `reviews/{id}` (`status`, `updatedAt: serverTimestamp()`, `updatedBy`, `updatedByName`) and adds `reviews/{id}/history/{auto}` (`from`, `to`, `by`, `byName`, `at`). It's a no-op when `from === to`.
  - `addComment(submissionId, text, me)`, `editComment(commentId, text)` (sets `editedAt`), `deleteComment(commentId)`.

- [ ] **Step 1: Implement `actions.ts`** with the exact doc shapes allowed by the Task 4 rules.
- [ ] **Step 2: Implement `ScoreBar`.**
  - "Your score" shows 1–5 buttons, with the selected one highlighted, plus a "clear" link.
  - The team summary reads `"Team: {avg} avg from {count} scores ({min}–{max})"` when revealed. Otherwise it reads `"{count} scores · score to reveal"`.
  - The revealed view lists the entries (`name value`) behind a small "who" toggle.
  - Respects the shared `showAllScores` setting.
- [ ] **Step 3: Implement `DecisionBar`** (rendered only when `me.role === 'admin'`).
  - Approve, Maybe and Decline buttons in the status colors, with the current status outlined.
  - Below them, the history ("Approved by Elif · 12 Nov 14:03") from `reviews/{id}/history` ordered by `at` descending. Subscribe to it only while the page is open.
  - Members see the status chip only.
- [ ] **Step 4: Implement `Comments`.**
  - The list shows name, relative time and "(edited)".
  - The author gets Edit and Delete buttons on their own comments.
  - A textarea with Add, where Ctrl/Cmd+Enter submits. Typing in it must not trigger arrow navigation.
- [ ] **Step 5: Verify against the emulator** (any rule rejection shows up as an error banner, never as a silent failure):
  - As **member**: scoring reveals the team scores. Comment, edit and delete your own comment. There are no decision buttons.
  - As **admin**: Approve in "Pending" mode, then press →. You land on the next pending talk, and the counts and balance row update immediately.
  - Changing a score while sorted by score doesn't reorder Prev and Next until you click a chip or reload.
  - The Emulator UI shows `reviews/{id}` plus a `history` entry for each change.
- [ ] **Step 6: Run** `npm test --prefix web && npm test`. Expected: PASS (no regressions).
- [ ] **Step 7: Commit.** `git commit -m "feat(web): scoring, admin decisions with history, comments"`

---

### Task 10: Logistics page and CSV export

**Files:**
- Create: `web/src/lib/logistics.ts`, `web/src/pages/LogisticsPage.tsx`
- Test: `web/src/lib/logistics.test.ts`

**Interfaces:**
- Consumes: `statusOf`, `Submission`.
- Produces:
  - `interface LogisticsRow { kind: 'speaker' | 'co-speaker'; name: string; email: string; phone: string; talks: string; fromAbroad: string; abroadFrom: string; outsideIstanbul: string; city: string; transport: string; accommodation: string; tour: string; afterParty: string; tshirt: string; otherRequirements: string; anythingElse: string }`
  - `logisticsRows(subs: Submission[], reviews: Map<string, Review>): LogisticsRow[]`
    - There's one `speaker` row per `speakerKey` that has at least one approved, non-removed talk. Its fields come from that speaker's approved submission with the highest `row`.
    - `talks` joins the approved titles with `' | '`.
    - There's one `co-speaker` row per approved talk that has a `coSpeaker`, with name, email, phone and talk filled in and the logistics fields set to `''`.
    - Rows are sorted by name with `localeCompare('tr')`.
  - `toCsv(rows: LogisticsRow[]): string`. It starts with `'﻿'`, uses `\r\n` line endings, and has a fixed header: `Type,Name,Email,Phone,Talks,From abroad,Coming from (abroad),Outside Istanbul,City,Transport support,Accommodation support,Istanbul tour,After party,T-shirt,Other requirements,Anything else`. RFC 4180 quoting applies when a field contains `,`, `"`, `\r` or `\n`.

- [ ] **Step 1: Write the failing tests.**
  - `logisticsRows`:
    - A speaker with 2 approved talks gives **1** row with `talks: 'A | B'`.
    - A speaker with only declined talks gives no row.
    - An approved talk with co-speaker "Rishi" adds a `co-speaker` row with `tshirt: ''`.
    - An approved removed talk is excluded.
  - `toCsv`:
    - The output starts with `'﻿'`.
    - It has 2 lines for 1 row, split on `\r\n`.
    - `'Paris, France'` becomes `'"Paris, France"'`.
    - `'say "hi"'` becomes `'"say ""hi"""'`.
    - A field containing `'line1\nline2'` is quoted.
    - `'Türkiye'` and `'İstanbul'` appear unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the lib and `LogisticsPage`.** The page shows a table of `logisticsRows` and an "Export CSV" button that downloads `devfest-speakers-logistics.csv` from a `Blob` with `type: 'text/csv;charset=utf-8'`.
- [ ] **Step 4: Run tests.** Expected: PASS. Manual check: export from the seeded emulator, then open the file in Google Sheets (File → Import) and in Excel if available. Turkish characters and multi-line answers should come through intact.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): logistics list with CSV export"`

---

### Task 11: Team page

**Files:**
- Create: `web/src/lib/team.ts`, `web/src/pages/TeamPage.tsx`
- Modify: `web/src/data/actions.ts` (add `setRole`)
- Test: `web/src/lib/team.test.ts`

**Interfaces:**
- Consumes: `UserDoc`, `Role`.
- Produces:
  - `teamGroups(users: (UserDoc & { uid: string })[]): Record<'waiting'|'member'|'admin'|'removed', (UserDoc & { uid: string })[]>`. Each group is sorted by name.
  - `setRole(uid: string, role: Role): Promise<void>`.

- [ ] **Step 1: Write the failing test.** `teamGroups` puts each user in their role's group, sorted by name, with empty groups present as `[]`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `TeamPage`** (admin only, and it subscribes to `users` itself).
  - **Waiting:** Approve (→ member) and Reject (→ removed).
  - **Members:** Make admin and Remove.
  - **Admins:** Make member and Remove.
  - **Removed** (collapsed): Restore (→ member).
  - **The signed-in admin's own row shows "you" and no buttons.**
- [ ] **Step 4: Run tests.** Expected: PASS. Manual check:
  - Sign in as a new account so it appears under Waiting, then approve it as admin. The other browser moves from the Waiting screen to the app without a reload, through the `users/{uid}` snapshot.
  - Removing that account sends it back to the "access removed" screen.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): team page for approving and managing access"`

---

### Task 12: Inline speaker photos (Drive → Storage)

**Files:**
- Create: `functions/src/photos/syncPhotos.ts`, `storage.rules`
- Modify: `functions/src/sync/runSync.ts`, `functions/src/index.ts`, `web/src/components/SpeakerPhoto.tsx`
- Test: `functions/test/syncPhotos.test.ts`, `tests/rules/storage.rules.test.ts`

**Interfaces:**
- Consumes: `SubmissionData.photoFileId`, `photoUrl`.
- Produces:
  - `syncPhotos(subs: SubmissionData[], deps: { exists(path: string): Promise<boolean>; download(fileId: string): Promise<{ data: Buffer; contentType: string }>; save(path: string, data: Buffer, contentType: string): Promise<void> }): Promise<{ copied: number; skipped: number; failed: string[] }>`
    - The Storage path is `photos/{fileId}`.
    - It skips files that already exist.
    - It skips (counted in `failed`) anything that isn't `image/*` or is larger than 10 MB.
    - A failed download doesn't stop the others.
  - `runSync`'s `opts.photos` (defined in Task 5) is now wired up, and it's called after `applySync`. A photo failure is logged but **does not** set `meta/sync.error`.
  - `index.ts` wires the real deps. `download` uses `google.drive('v3').files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })` with the scope `https://www.googleapis.com/auth/drive.readonly`. `exists` and `save` use `getStorage().bucket()`.
  - `storage.rules`: `match /photos/{f}` allows `read` if `firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role in ['member','admin']`. `write` is never allowed.
  - `SpeakerPhoto({ fileId, url })` calls `getDownloadURL(ref(storage, 'photos/' + fileId))` and renders `<img>` (round, 96px). On error, or with no `fileId`, it falls back to an "Open photo ↗" link, or to nothing when there's no `url`.

- [ ] **Step 1: Write the failing tests.**
  - `syncPhotos` (with fake deps):
    - An existing photo is skipped.
    - A new one is copied to `photos/ID`.
    - `contentType: 'application/pdf'` → `failed: ['ID']`.
    - A 11 MB buffer → failed.
    - A download that throws for one id still lets the others copy.
    - Subs with a null `photoFileId` are ignored.
  - Storage rules: a member can read `photos/x`, a waiting user can't, and nobody can write.
- [ ] **Step 2: Run** `npm test --prefix functions && npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** everything above.
- [ ] **Step 4: Run.** Expected: PASS. Manual check: in the emulator, upload a test image to `photos/<fakeFileId>` that matches a seeded row. The meeting mode shows it, and the other rows show the link fallback.
- [ ] **Step 5: Commit.** `git commit -m "feat: copy speaker photos from Drive and show them inline"`

---

### Task 13: README and first deploy (owner checkpoint)

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write `README.md`.**
  - **Local dev:** Java 21, `npm i` in the root, `functions` and `web`, start the emulators, seed, `VITE_USE_EMULATORS=true npm run dev --prefix web`, and the test commands.
  - **Setup for the owner:**
    1. Project `speaker-dashboard-9c149` already exists on Blaze. If Firestore and Storage aren't created yet, create them in a **European location** such as `eur3` or `europe-west1`; this can't be changed later. Enable the **Google** sign-in provider.
    2. Enable the **Google Sheets API** and the **Google Drive API** in the GCP project.
    3. Create the service account `cfp-sync`. Grant it `roles/datastore.user` and `roles/storage.objectAdmin`, and let the Functions deployer act as it (`roles/iam.serviceAccountUser`).
    4. Share the response sheet and the Form's photo upload folder with `cfp-sync@speaker-dashboard-9c149.iam.gserviceaccount.com` as **Viewer**. **Never "Publish to web".**
    5. Fill in `functions/.env` (`SHEET_ID`, `SHEET_TAB`, `SYNC_SERVICE_ACCOUNT`) and `web/.env.production` (the `VITE_FIREBASE_*` values from the Firebase console, under Project settings → Your apps → Web app).
    6. Run `npm run build --prefix web && npx firebase deploy`.
    7. Open the hosted URL, sign in once, then run `cd functions && GOOGLE_CLOUD_PROJECT=speaker-dashboard-9c149 npx tsx scripts/make-admin.ts <your email>`. This needs `gcloud auth application-default login`.
  - **Team rule:** don't sort or delete rows in "Form Responses 1".
- [ ] **Step 2: Commit.** `git commit -m "docs: setup and deploy guide"`
- [ ] **Step 3: STOP and hand off to the owner.** Deploying creates real cloud resources on a billed project and needs the owner's Google accounts. Don't run `firebase deploy` until the owner has done setup steps 1–5 and explicitly says to deploy.
- [ ] **Step 4 (after the owner says go): deploy and verify against the real sheet.**
  - Pressing Refresh shows as many submissions as the sheet has responses.
  - `meta/sync.error` is null.
  - A non-approved Google account sees only the Waiting screen.
  - Photos load for the rows whose files are in the shared folder.
