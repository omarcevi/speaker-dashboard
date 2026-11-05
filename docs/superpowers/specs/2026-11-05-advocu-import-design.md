# Advocu import: Design

Date: 2026-11-05
Status: draft, waiting for approval
Builds on: [2026-10-29-speaker-dashboard-design.md](2026-10-29-speaker-dashboard-design.md)

## Why this exists

DevFest Istanbul 2026 takes talk applications in two places:

- the Google Form, which the dashboard already syncs
- **Advocu** (app.advocu.com)

Advocu is a closed platform with no API. The only way out is a CSV export, which an organizer downloads after signing in. The team re-exports "from time to time" while applications keep arriving.

Some speakers applied in both places, sometimes with the same talk and sometimes with different talks. The team wants to review every application in one place, in the same meeting flow, without reviewing the same talk twice.

**Success:**
- An admin uploads the current Advocu export from the dashboard.
- Advocu talks then appear next to Form talks, and the same talk submitted in both places shows up as one card.
- Uploading a newer export later updates what's there without losing any scores, comments or decisions.

## Goals

1. An admin uploads an Advocu CSV export on the dashboard. Before anything is written, a preview shows what will change. The admin then confirms.
2. Each Advocu application becomes a talk card: in the list, in meeting mode, on the speaker panel, in the balance counter and in the logistics view, just like Form talks.
3. **Duplicates.**
   - **Same talk:** same speaker email and same title after normalisation (see Matching). It shows as **one card** labelled as coming from both sources.
   - **Same speaker, different talks:** they stay separate cards, grouped under the speaker the way multiple Form talks already are.
4. Re-uploading a newer export:
   - updates changed applications
   - adds new ones
   - hides applications that are no longer in the export
   - never touches reviews, scores or comments
5. The dashboard stays the only place decisions are made. Advocu's own status (`ACCEPTED`, `PENDING`) never sets or changes a dashboard decision.

## Non-goals

- Logging in to Advocu or scraping it. There is no API, and an upload is the only path.
- Writing anything back to Advocu, such as accepting a talk there.
- Collecting logistics from Advocu speakers. The owner said approved Advocu-only speakers will be asked to fill in the Google Form, and their logistics come from there (see Logistics).
- Matching people who used different emails on the two platforms. Matching uses email only.
- A source filter on the list. A badge on each card is enough.
- Photos for Advocu talks. Advocu has none.

## Anti-goals (failure even if it "works")

- **A review, score or comment ends up on the wrong talk or disappears.** This includes the moment a duplicate pair forms or splits later.
- **The 15-minute sheet sync breaks Advocu data.** For example, it marks every Advocu talk as "removed from sheet", or its moved-row guard fires because of Advocu documents.
- **The real export lands in the repo, in Storage or in logs.** It holds personal data. The raw CSV text is never stored; only the parsed fields are written to Firestore, the same as for Form submissions. Tests use made-up rows with the real headers.
- **A wrong file wipes the Advocu talks.** Examples are the Form CSV, an empty export, or an export filtered in Advocu. The preview must make this obvious before anything is written, and some cases are refused outright (see Import flow).

## The Advocu export (format as observed)

- A UTF-8 CSV with CRLF line endings, standard RFC 4180 quoting, and one header row.
- It has 26 columns, in this order:
  - `Creation date`, `Status`
  - `Speaker email`, `First name`, `Last name`
  - `Company`, `Job title`, `Country`, `City`, `Bio`
  - `Call for Papers title`
  - `Proposal title`, `Proposal abstract`
  - `Proposal languages`, `Proposal topics`
  - `Session type`, `Audience level`, `Participation type`, `Session length`
  - `Eligible`, `Rejection reason`, `Review feedback`
  - `Reviewer first name`, `Reviewer last name`, `Reviewer email`
  - `External user`
- **No application ID.** `Creation date` is an ISO-like timestamp and is unique per application in the observed export.
- **Multi-value cells:** `Proposal languages`, `Proposal topics`, `Session type`, `Audience level` and `Participation type` are comma-separated lists inside one quoted cell.
- **Topics** look like `AI - Gemini`, `Cloud - Run`. The part before ` - ` is the top-level area.
- **Status** values seen are `ACCEPTED` and `PENDING`. Others may exist.
- **A speaker may have several applications**, often a lot.
- Columns should be found by header name, not position, so a reordered export still works.
- **Required columns:**
  - `Creation date`
  - `Speaker email`
  - `Proposal title`
  - `First name`
  - `Last name`
- If any required column is missing, refuse the file with a clear message. This also catches someone uploading the Form CSV by mistake.

## Identity and matching

- **Advocu application key:** lower-cased, trimmed `Speaker email` plus `Creation date` converted to an exact instant. The observed format is ISO-8601 UTC with milliseconds (`YYYY-MM-DDTHH:MM:SS.mmmZ`). The document id is `advocu-<short hash of that key>`.
  - It stays the same across re-exports, even if the speaker edits the title or abstract.
  - If two rows in one export produce the same key, refuse the file and name the problem.
- **Fallback re-match.** Sometimes an incoming application's key doesn't match any stored application, but its email and normalised title match exactly one stored Advocu application that is missing from this export. In that case it is the same application: it keeps the stored id and gets updated. This guards against Advocu changing its date output. *(Claude's call.)*
- **Speaker grouping:** reuse `speakerKey` (lower-cased trimmed email), so a speaker's Form and Advocu talks group together automatically.
- **Same-talk match:** same `speakerKey` and the same normalised title.
  - To normalise a title: lowercase it, turn every run of non-letter and non-digit characters into one space, and trim.
  - Keep Unicode letters, so Turkish titles still compare correctly.

## Merged cards ("Form + Advocu")

A **talk group** is every document, from either source and whether or not it has been removed, that shares the same `speakerKey` and the same normalised title.
- In practice this is usually one Form talk plus one Advocu application.
- The rule is the same for any size. An existing Form-only pair with the same title also folds into one card. *(Claude's call: same talk, same speaker, so the team shouldn't review it twice.)*

**Review data** means any of these exist for a document:
- a `reviews/{id}` doc (including one reset to Pending)
- any score
- any comment

**Merging:**
- A group shows as **one card** everywhere:
  - the list
  - the status counts
  - meeting-mode stepping
  - the balance counter
  - the speaker panel's "other talks"
  - logistics
- **The group is not merged if two or more of its documents already have review data.**
  - Each of those documents stays its own card, with a visible "Possible duplicate of …" note linking to the others.
  - The team resolves it by hand, for example by declining one.
  - This is the only case where duplicates stay visible. It guarantees that no decision, score or comment is ever hidden.

**The primary.** The merged card's decision, scores, comments and status history are read from, and written to, the primary. The primary is the first of these that applies:
1. the one document in the group that has review data, whether or not it has been removed
2. the most recent **present** Form document
3. the most recent **present** Advocu document
4. if every document has been removed: the most recent Form document, then the most recent Advocu document

*(Claude's call, after the task review. Picking from present documents first means an unreviewed card always shows its primary. So the content doesn't change the moment someone scores it, and review data never lands on a document nobody could see.)*

The primary is stable in practice: once the team acts on a merged card, only the primary has review data, and hidden documents can't gain any. *(Claude's call. It replaces "first in the database", which could hide a decision made on the newer document.)*

**Card content:**
- **A reviewed version is never silently replaced.** When the primary is present, the card shows the primary's own fields. Given the primary rule, that's the version the team reviewed or is about to review.
- Only when the primary has been removed does the card fall back to another document: the most recent present Form document, then the most recent present Advocu document, then the primary if every document has been removed.
- The card adds an "Also on Advocu" block with the Advocu-only details: from the primary if it's an Advocu document, otherwise from the most recent present Advocu document.
- **Version warning.** When the primary has review data but the card shows another document's content (because the reviewed version was removed), the card shows a visible warning: "Showing a different <Form|Advocu> version than the one reviewed".
- **Possible-duplicate cards (two or more reviewed members)** link only to the other members that are still present. A removed member behaves like any removed row: hidden unless "Show removed rows" is on.
- *(Claude's call, after a security review.)* The Form's email field is typed, not verified, so anyone could submit the same email and title. Without these two rules, that would silently swap the content of an approved card.

**Forming and splitting:**
- When a group forms later (for example, an approved Advocu-only speaker fills in the Form with the same title), it merges automatically. The card keeps the existing decision, because the reviewed document becomes the primary.
- If titles are edited so they no longer match, the group splits back into separate cards. Each card keeps its own review data.
- **A merged card disappears only when every document in the group is removed.** Removed documents (gone from the sheet or the export) still belong to their group and can still be its primary. That way, a decision made on the version that disappeared stays on the visible card. When the primary has been removed, the card shows the content of a version that's still present, with the version warning (see Card content):
  1. the latest present Form document
  2. otherwise, the latest present Advocu document
  3. otherwise, the primary

**Mechanism.** Groups and primaries are **computed when displayed** from data the web app already loads: submissions, reviews, scores and comments. No link is stored. The import preview uses the same pure grouping function to count merges. *(Claude's call: nothing extra to keep in sync, and sheet sync needs no linking logic.)*

## Field mapping (Advocu → card)

| Card field | From Advocu |
|---|---|
| firstName, lastName, email, company, jobTitle, bio | same-named columns |
| title, abstract | `Proposal title`, `Proposal abstract` |
| speakerKey | lower-cased trimmed email |
| topic | the full `Proposal topics` text, shown on the card |
| topicGroup (drives the balance counter) | the **first matching rule**, checked in this order over all of the talk's topic tags:<br>1. any tag mentioning Gemini, agent, LLM or generative, or a top-level area of `Build with AI` → `Generative AI, LLMs & agents`<br>2. any other `AI` tag → `Artificial Intelligence / Machine Learning`<br>3. top-level `Cloud`, `Google Cloud`, `Networking`, `Storage` or `Identity` → `Cloud / DevOps / Infrastructure`<br>4. `Firebase` → `Mobile Development`<br>5. `Web` → `Web Development`<br>6. `UX / UI Design` → `Product / Design / UX`<br>7. only event tags (`DevFest`, `Google I/O Extended`) or anything else → `Other` |
| language | keep only `English` and `Turkish` from `Proposal languages`, written the way the Form writes them (`English`, `Turkish`, or `English, Turkish`). If neither is present, use an empty string. Show the full original list on the card. |
| level | map `Advance` to `Advanced`. With one value, use it. With several, use `Intermediate` if it's one of them, otherwise the first. Show the full original list on the card. |
| Advocu-only details shown on the card | session type(s), session length, participation type (in-person or virtual), country, city, Advocu status (as plain information) |
| phone, photo, links, co-speaker, logistics, consent | empty: Advocu doesn't collect these |
| source | `advocu` (Form documents count as `form`, including existing ones that have no source field) |

The topicGroup, language and level mappings were proposed by Claude and accepted by the owner.

## Import flow

1. A new admin-only page, **Import**, sits in the nav next to Team. It shows when the last import happened, who ran it, and how many applications it had.
2. The admin picks the CSV file.
3. The browser sends the file text to a callable function, `importAdvocu`, in **preview** mode.
   - The function checks that the caller is an admin, parses the file, and plans the changes against Firestore.
   - It writes nothing and returns counts:
     - new applications
     - updated applications
     - unchanged applications
     - applications that will be **hidden** because they're missing from this export
     - applications that **merge** with an existing Form talk
     - speakers involved
   - It also returns:
     - the distinct `Call for Papers title` values in the file
     - any rows it rejected, with the reason
4. The page shows the preview. The admin confirms.
   - Hidden applications are highlighted, so a wrong or filtered export is obvious.
   - A strong warning appears in two cases:
     - more than half of the stored Advocu applications would be hidden
     - the file has more than one call-for-papers title
5. **Every row is imported, whatever its Advocu status or `Eligible` value.** Both are shown on the card as information only. *(Claude's call: the export is per event, the observed export has one call for papers, and the dashboard makes the decisions.)*
6. The function runs again in **apply** mode.
   - It **re-plans** against the current database instead of trusting the preview.
   - It writes the documents, then records the import in `meta/advocu`: time, admin, counts, and any error.
7. **Refused outright,** with nothing written:
   - required columns are missing
   - the export has no data rows
   - application keys are duplicated within the file
   - the file is larger than a sane cap (a few MB)

Server-side parsing is required. Parsing and planning live in `functions/` as pure, unit-tested code, like the sheet sync, so there's one parser and it's testable.

## Effects on existing parts

- **Sheet sync:**
  - It must consider only Form documents when planning adds, updates and removals, and in the moved-row guard.
  - It must never mark Advocu documents as removed.
  - It needs no linking logic, because groups are computed when displayed.
- **List and meeting mode:**
  - Show a small source badge: `Advocu`, or `Form + Advocu` on merged cards.
  - The "date" sort orders Form and Advocu talks together by submission time.
  - Hidden duplicates are never stepped through.
- **Status counts and balance:** count each merged card once.
- **Logistics:**
  - **Name, email and phone always come from the speaker's approved card.** That is what the team reviewed. A newer Form response never overrides them.
  - **Where the logistics fields come from,** in order:
    1. The latest present Form document of the speaker's that is **approved**. The row shows `Form answers: Yes`.
    2. Otherwise, the latest present Form document that is **not declined**: the case where an approved Advocu-only speaker filled in the Form afterwards, possibly with a different title. The row shows `Form answers: Unreviewed`, with the tag "From an unreviewed Form response — confirm with the speaker".
    3. Otherwise, the logistics fields are empty. The row shows `Form answers: No`, with the tag "No Form answers yet", so the team knows whom to chase.
  - Co-speaker rows leave the Form answers cell empty.
  - *(Claude's call, after a security review.)* The Form's email field is typed, not verified, so anyone could submit with an approved speaker's email. This rule keeps the reviewed contact details, and makes unreviewed logistics visible instead of silently trusted. Declined responses are never used.
- **Firestore rules:**
  - Members can read `meta/advocu`.
  - All writes to `submissions` and `meta` stay server-only.
- **Functions:** `importAdvocu` uses the `cfp-sync` service account and the same memory and timeout settings as the sync functions.

## Constraints

- Same stack and conventions as v1:
  - Cloud Functions 2nd gen on Node 22 in europe-west1
  - React and Vite web app with plain CSS
  - Vitest
  - emulator-first local development
  - rules tests
- No real personal data in the repo: fixtures are made-up rows with the real Advocu headers. Never commit, copy or log the real export.
- The repo is public, so docs and tests must not include real counts or names from the export.
- "Nothing too fancy, the dashboard needs to just work."

## Left to the builder

- Exact UI layout of the Import page and the "Also on Advocu" block.
- Where the shared grouping function lives, so the web app and `functions/` can both use it. It must stay a pure function with no imports, like `model.ts`.
- The hash function and length for Advocu document ids.
- How submission time is stored for sorting across sources.
- Wording of preview counts and error messages.
