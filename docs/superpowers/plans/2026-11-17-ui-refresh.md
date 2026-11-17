# UI Refresh (DevFest Colours) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle and restructure every web screen to match the approved mockups, keeping all data behaviour.

**Architecture:** One plain stylesheet (`web/src/styles.css`) ported from the mockup's `app.css`, a sidebar shell, and page components rewritten against the mockup markup. Data, Firestore listeners, rules and Functions are untouched; the only logic changes are in `web/src/lib` and are test-first.

**Tech Stack:** React 19 + Vite + TypeScript, plain CSS, Firebase web SDK, Vitest.

**Spec:** `docs/mockups/2026-11-17-ui-refresh/` (open `index.html`; every screen links from it) and `PRODUCT.md`. Where this plan and the mockup disagree on visuals, the mockup wins; where the mockup's sample data disagrees with the real data model, the data model wins.

## Global Constraints

- The four Google colours mean the four statuses only: Pending `#1a73e8`, Maybe `#f9ab00`, Approved `#1e8e3e`, Declined `#d93025`, with pale pills `#e8f0fe/#174ea6`, `#fef7e0/#7a4300`, `#e6f4ea/#0d652d`, `#fce8e6/#a50e0e`. Links, focus, the selected score and primary buttons are near-black `#202124`.
- Typeface: Google Sans Flex from Google Fonts (`opsz,wght@6..144,1..1000`), fallback `system-ui`.
- Contact details (email, phone, social links) appear on the Talk page and Logistics only, never in the list.
- The list has no language column and no language filter.
- No new npm dependencies.
- Keep the anti-anchoring rule: team scores stay hidden until you score or turn on "Show all team scores".
- Commits carry no Claude attribution (owner's global rule).

## Review Focus

1. **Scroll on the Talk page.** The compact bar must not change layout; wheel-scrolling down must never move the page up (the mockup bug of 2026-11-17). Pinned by the scroll check in Task 6.
2. **Typing in the comment box or a select** must not trigger ← → stepping or the P projector toggle. Pinned in Task 4.
3. **Members (not admins)** see the status pill instead of decision buttons, and no Admin nav group. Checked in Task 6 by signing in as `member@example.com`.
4. **Filters that match nothing** show an empty state with a working "Clear filters", and the count cards show zeros, not a blank row. Pinned by `countByStatus` tests and Task 3.
5. **A talk outside the current stepping scope** (just decided while stepping "Pending only") still shows Previous/Next and says it is not in that scope. Existing `neighbors` tests cover the order; Task 4 renders the message.

---

### Task 1: List logic (language out, counts follow filters) and the projector preference

**Files:**
- Modify: `web/src/lib/listView.ts`, `web/src/lib/listView.test.ts`
- Modify: `web/src/lib/prefs.ts`, `web/src/lib/prefs.test.ts`

**Interfaces:**
- Produces: `ListFilter` without `language`; `countByStatus(rows: ListRow[]): Record<Status | 'all', number>`; `loadProjector(): boolean` (default `false`), `saveProjector(v: boolean): void` (key `projectorView`, storage errors swallowed like the other prefs).

- [ ] **Step 1: Write the failing tests** in `listView.test.ts`: `readQuery` ignores `?language=English` (result has no `language` key); `writeQuery` never emits `language`; `countByStatus(applyFilter(rows, { ...defaults, topic: 'Cloud' }))` equals `{ all: 1, pending: 0, maybe: 0, approved: 1, declined: 0 }`; `countByStatus(applyFilter(rows, defaults))` excludes the removed row (`all: 3`). Remove `language` from `defaults`. In `prefs.test.ts`: projector defaults to `false`, round-trips, and falls back to `false` when storage throws.
- [ ] **Step 2: Run** `npm test --prefix web` → the new tests fail (missing export / type error).
- [ ] **Step 3: Implement** the interfaces above; delete the `language` branch from `applyFilter`, `readQuery`, `writeQuery`.
- [ ] **Step 4: Run** `npm test --prefix web` → all pass.
- [ ] **Step 5: Commit** `feat(web): drop the language filter, count statuses within the current filters, projector pref`.

### Task 2: Tokens, shell and sidebar

**Files:**
- Rewrite: `web/src/styles.css` (port of the mockup `app.css`; keep its token names)
- Modify: `web/index.html` (font links, title `DevFest Istanbul Speakers`, favicon = the four-dot mark as an inline SVG data URI)
- Create: `web/src/components/Icons.tsx` (the mockup's 16px outline icons as small components: `IconList`, `IconMap`, `IconBag`, `IconTeam`, `IconUpload`, `IconOut`, `IconSearch`, `IconRefresh`, `IconLeft`, `IconRight`, `IconMail`, `IconPhone`, `IconLink`, `IconMenu`, `IconDownload`, `IconScreen`), and `Mark` (four dots + "DevFest Istanbul" / "Speakers 2026")
- Rewrite: `web/src/components/Nav.tsx` → labelled sidebar (Submissions, Topic map, Logistics; Admin group: Team with a "N waiting" tag, Import), user row with sign-out icon button; below 1024px a top bar with a menu button that shows the sidebar
- Modify: `web/src/App.tsx` (`<div class="app">` grid, `<main class="canvas">`, apply `html.projector` from `loadProjector()`), `web/src/components/StatusChip.tsx` (pill with dot, class `status st-<status>`), `web/src/components/SourceBadge.tsx` (class `tag`)

**Interfaces:**
- Produces: CSS classes used by later tasks exactly as named in the mockup (`card`, `pad`, `btn`, `btn primary`, `btn sm`, `status st-*`, `tag`, `counts`, `count`, `strip`, `filters`, `search`, `select`, `switch`, `table-card`, `resp`, `cell-main`, `cell-sub`, `object`, `verdict`, `seg score`, `seg decide`, `talk-grid`, `stack`, `contact ruled`, `kv`, `setting`, `people`, `notice`, `summary`, `mini-anchor`, `mini`); `<StatusChip status>`; `<Mark/>`; icon components.
- The waiting count: admins only, `onSnapshot(query(collection(db, 'users'), where('role', '==', 'waiting')))` inside `Nav`; members never subscribe.

- [ ] **Step 1:** Port the CSS, write `Icons.tsx`, rewrite `Nav`, wire `App`.
- [ ] **Step 2: Run** `npm run build --prefix web` and `npm run lint --prefix web` → no errors.
- [ ] **Step 3: Commit** `feat(web): DevFest Colours tokens, sidebar shell and status pills`.

### Task 3: Submissions list

**Files:**
- Create: `web/src/components/StatusFilter.tsx` — `StatusFilter({ counts, active, onSelect, label }: { counts: Record<Status | 'all', number>; active: Status | 'all'; onSelect(s: Status | 'all'): void; label: string })`: five `count` buttons (`aria-pressed`) and the proportion `strip` below them (segments only for statuses with a count above 0).
- Rewrite: `web/src/pages/ListPage.tsx`; restyle `web/src/components/RefreshButton.tsx` (stamp "Synced …" + outlined Refresh; refresh failure inline; admin sync errors and missing columns in a `notice`, the "don't sort rows" hint moves to Import)
- Modify: `web/src/lib/syncStatus.ts` only if the stamp wording needs it (keep its tests green)

**Interfaces:**
- Consumes: `countByStatus`, `ListFilter` (Task 1); `StatusChip`, `SourceBadge`, icons (Task 2).
- Produces: `StatusFilter` (reused by Task 5).

- [ ] **Step 1:** Title row (h1 Submissions, lede "DevFest Istanbul 2026 CFP · N talks from M speakers" with N = live cards and M = distinct `speakerKey`s, stamp + Refresh); `StatusFilter` fed by `countByStatus(applyFilter(rows, { ...filter, status: 'all' }))`; one filter row: search (placeholder `Search talks, speakers, companies`), Topic, Level, Sort (`Submission order` / `Highest score first` / `Most disagreement first`), "Show all team scores" switch.
- [ ] **Step 2:** Table with five columns. Talk: title, sub "topic · level" plus `SourceBadge`, `No session`, `Removed from sheet` tags. Speaker: name, sub "job title, company" plus `+N other talk(s)` tag. Score (right-aligned): revealed → avg to one decimal over "min–max · N scores" (single value when min = max); hidden with scores → "—" over "Hidden · N scores" with title "Score this talk to see the team's scores"; none → "—" over "No scores yet". Comments: count, `0` in faint ink. Mark cells with `data-col` = `status`, `talk`, `speaker`, `score`, `hide-sm` (comments) for the phone layout. Whole row navigates (click and Enter), keeping the query string.
- [ ] **Step 3:** Footer: "N talks" or "N of M talks match the filters"; removed rows: "N rows removed from the sheet are hidden · Show" / "Hide removed rows" toggling `showRemoved`. Empty result: "No talks match these filters" + Clear filters (resets q, topic, level, status).
- [ ] **Step 4: Run** `npm test --prefix web && npm run build --prefix web && npm run lint --prefix web` → pass.
- [ ] **Step 5: Commit** `feat(web): submissions list with status count cards, one filter row and company`.

### Task 4: Talk page

**Files:**
- Rewrite: `web/src/pages/MeetingPage.tsx`
- Create: `web/src/components/TalkHeader.tsx` (object card + compact overlay bar), `web/src/components/ApprovedSoFar.tsx` (replaces `BalanceRow.tsx`, which is deleted)
- Restyle: `ScoreBar.tsx` (segmented 1–5, note under it), `DecisionBar.tsx` (segmented Approve/Maybe/Decline with dots; pressed = status tint; members get `StatusChip`), `StatusHistory.tsx` (latest change as "by X · date" after the status pill; older entries in a "History (N)" disclosure), `TalkPanel.tsx`, `SpeakerPanel.tsx`, `OverviewBox.tsx`, `SimilarTalks.tsx`, `Comments.tsx`, `AdvocuDetails.tsx`, `SpeakerPhoto.tsx` (52×64 portrait, radius 10; initials when there is no photo)

**Interfaces:**
- Consumes: `loadProjector`/`saveProjector` (Task 1), `StatusChip`, icons.
- `TalkHeader({ card, status, scores, me, showAll, admin })` renders the full header (`#object`) and the compact bar; the compact bar is a zero-height sticky anchor whose child is absolutely positioned and shown with class `show` by an `IntersectionObserver` on the header (`rootMargin: '-72px 0px 0px 0px'`). It must never change layout height.

- [ ] **Step 1:** Stepper row: "‹ Submissions" back link (keeps query), scope `select` ("All talks", "Pending only", …) that rewrites `status` in the query, "X of N" (or "Not in pending · N there" when the current talk is outside the scope), key hint `← → to step · P projector`, Projector view toggle button (`aria-pressed`), Previous/Next. Keyboard: ← → step, P toggles projector; all ignored when focus is in `input, textarea, select, [contenteditable]` or a modifier key is held.
- [ ] **Step 2:** Header card: portrait, title (h1), meta "speaker name · job title, company · topic · level · language" + Source/version/duplicate/no-session/removed tags; right side: Your score + team note, Decision + status pill and latest change. Below 1280px the score/decision block wraps under the title; below 720px it stacks and the header is not sticky.
- [ ] **Step 3:** Body grid (4fr / 2fr). Main: Talk card (Abstract, Key takeaways, Presented before / talk history, Advocu details, co-speaker with email and phone + Copy), Gemini overview card (summary sentences, flags as a definition list with the "why" under each value, Regenerate for admins), Comments card (list + composer). Side: Speaker card (portrait, name, role; contact group with email/phone + Copy and LinkedIn/X/GitHub/Instagram links; GDE, Coming from, Consent; Bio, Speaking experience (open), Why DevFest Istanbul, Anything else as disclosures), "Also submitted by <first name>" card when there are other talks, Similar talks card (keep the "already approved and very similar" warning), Approved so far card (topic bars, language and level lines).
- [ ] **Step 4:** Projector view: `html.projector` hides sidebar, top bar, key hint, contact group, comment composer and Regenerate; `zoom: 1.35` (1.6 at ≥1800px); darker secondary text. Persist with `saveProjector`.
- [ ] **Step 5: Run** `npm test --prefix web && npm run build --prefix web && npm run lint --prefix web` → pass.
- [ ] **Step 6: Commit** `feat(web): talk page with header actions, compact bar, contact details and projector view`.

### Task 5: Topic map, Logistics, Team, Import, Sign-in and Waiting

**Files:**
- Rewrite: `web/src/pages/TopicMapPage.tsx`, `LogisticsPage.tsx`, `TeamPage.tsx`, `ImportPage.tsx`, `SignInPage.tsx`, `WaitingPage.tsx`

- [ ] **Step 1: Topic map.** `StatusFilter` as a highlight (dims other statuses' dots, does not hide them); the real `mapView` coordinates; dots filled with the status colour; cluster panel listing each cluster's label, count, four-colour strip and "n pending · n approved …" line, plus the foot note. Keep the admin AI status notes. Cluster label size rises on narrow screens so it stays legible.
- [ ] **Step 2: Logistics.** Title + "N approved speakers and M co-speakers · from their Form answers", Export CSV as the primary button (CSV unchanged); summary strip computed from speaker rows: Need accommodation, Need transport, From abroad, Istanbul tour, After party, T-shirts by size; table: Person (name, Co-speaker tag, email, phone), Talks, Coming from (abroad city / outside-Istanbul city / "Istanbul"), Transport, Accommodation, Tour, After party, T-shirt, Notes (other requirements · anything else, clamped to two lines), Form answers state as a tag when not "yes". Phone: every value labelled (`data-label`).
- [ ] **Step 3: Team.** Settings layout: Waiting for approval, Admins, Members, Removed, each with its description and a people card; actions as small pill buttons (Approve is primary); the existing inline confirm flow kept.
- [ ] **Step 4: Import.** Settings layout: "Google Form sheet" (last sync, problems, the don't-sort notice, Sync now = `RefreshButton` action) and "Advocu applications" (description, last import line, file drop zone, preview tally New/Updated/Unchanged/Will be hidden, merged/speakers lines, warnings and rejected rows, Import N applications). No import history section (no data for it).
- [ ] **Step 5: Sign-in and Waiting.** Centred card with the mark; copy from the mockup; Waiting keeps the removed-access wording and the signed-in email.
- [ ] **Step 6: Run** `npm test --prefix web && npm run build --prefix web && npm run lint --prefix web` → pass.
- [ ] **Step 7: Commit** `feat(web): topic map, logistics, team, import and sign-in in the new design`.

### Task 6: Verify in the running app

- [ ] **Step 1:** Start the emulators with Java 21 on the PATH (`/opt/homebrew/opt/openjdk@21/bin`), seed them, run `npm run dev --prefix web`.
- [ ] **Step 2:** In headless Chrome, sign in through the auth emulator as `admin@example.com`, then as `member@example.com`; capture every route at 1440 and 390 and the Talk page in projector view.
- [ ] **Step 3:** Run the wheel-scroll check on `/talk/<id>`: scroll position never decreases, compact bar toggles at most twice.
- [ ] **Step 4:** Run `impeccable detect` and the taste inspector on the captures; fix what they flag; check members see no decision buttons and no Admin group.
- [ ] **Step 5:** Commit any fixes; then the README's UI notes if anything about running the app changed (nothing expected).
