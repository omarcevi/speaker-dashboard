# DevFest Istanbul Speaker Dashboard: Design

Date: 2026-10-29
Status: draft, waiting for approval

## Why this exists

Every year the DevFest Istanbul (GDG Istanbul) organizing team runs a Call for Papers through a Google Form, and the responses land in a Google Sheet. Review currently works like this. The team meets and walks through submissions one by one. For each one they judge the **talk** (title, abstract, takeaways, level) and the **speaker** (social profiles, professional background, speaking experience). They decide approve or decline in the room. Afterwards someone sends the decision emails in one batch.

The sheet is a poor review tool. It has no shared place for comments or scores, no clear status per talk, and it doesn't group one speaker's multiple talks together. This dashboard replaces the sheet as the place where review happens. The Google Form and its response sheet stay the intake source and are never edited by the dashboard.

**Timing:** the owner said the meeting and email dates don't affect the build. The plan doesn't need to be phased around a deadline.

**Success (v1):** the team runs the whole review meeting from the dashboard, from scoring ahead of time through approving, declining or marking Maybe on every talk. The resulting decisions are recorded cleanly enough that the parked email phase can be added later without reworking the data.

**The owner's guiding words:** "nothing too fancy, the dashboard needs to just work."

## Goals (v1)

1. Pull submissions from the live Google Sheet, with a manual Refresh button and automatic periodic sync.
2. View each submission's full details, including the speaker's profile and their other submissions.
3. Set a status on each submission: **Pending** (default), **Maybe**, **Approved**, **Declined**.
4. Comment on submissions.
5. Score submissions before or during the meeting (1–5 per team member).
6. Show a topic balance counter: approved talks by topic, language and level.
7. Provide a logistics view of approved speakers (travel, accommodation, T-shirts, and so on) with CSV export.
8. Restrict access. People sign in with Google, but they see nothing until an admin approves them.

## Parked by the owner (Phase 2)

**Sending decision emails from the dashboard, and email history.** The owner parked this on 2026-10-29 to focus on the dashboard first. The rules agreed so far are recorded in [Phase 2: Emails](#phase-2-emails-parked) at the end of this document. v1 must not build any email sending. It should keep speakers grouped by email and statuses recorded per talk, so Phase 2 can be added on top.

## Non-goals (v1)

- Sending emails, email templates, the Outbox, email history (parked, see Phase 2)
- A speaker-facing portal or "confirm attendance" links
- Exporting talks or speakers for the public website
- Agenda or schedule building
- Supporting multiple CFP editions side by side (v1 handles one sheet, set in config)
- Editing the Google Sheet or Form from the dashboard
- Phone-optimized layouts (laptops and a projected screen are the target, but it shouldn't break on a phone)

## Anti-goals (failure even if it "works")

- **A sync wipes or resets statuses, scores or comments.**
- **Speaker personal data (phone numbers, emails, bios) is reachable by anyone who isn't an approved team member.** For example, this happens if the sheet is "published to web", if database rules only hide data in the UI, or if a link is shared publicly.
- A member (non-admin) can change a decision, even by calling the backend directly.
- It grows fancy: heavy UI frameworks, animations, or features nobody asked for.

## Users and roles

| Role | Who | Can do |
|---|---|---|
| **Waiting** | Anyone who signed in with Google but isn't approved yet | Sees only "an admin needs to approve you". Has no data access. |
| **Member** | Approved team member | View all submissions and speakers, score, comment (edit or delete their own comments), use meeting mode, view the logistics list |
| **Admin** | Lead organizers | Everything a member can do, plus set status (Approve / Maybe / Decline), approve or remove users, promote or demote admins |

- Sign-in is **"Sign in with Google," any Google account** (personal Gmail is fine, because the approval gate is what controls access). *(my call)*
- The first admin (the project owner) is set once by hand, with a one-off script. *(my call)*
- Role checks must be enforced in **Firestore security rules and in the Cloud Functions**, not only in the UI.

## Data source and sync

- **Source:** the Google Sheet behind the form "DevFest Istanbul 2026 CFP", tab "Form Responses 1". Local CSV exports of it contain real personal data. Don't commit one, and don't copy one into the repo. Test fixtures should use made-up rows with the same column headers.
- **Access:** a Google Cloud service account. The sheet is shared with the service account's email as a **Viewer**. The sheet must never be "published to web". The sheet ID and tab name are stored in config, not hardcoded.
- **Sync** runs in a Cloud Function, triggered two ways: (a) a **Refresh** button any member can press, and (b) a schedule, **every 15 minutes**. *(my call)*
- Sync **upserts form fields only**. New rows become new Pending submissions. Changed rows update their form fields. Statuses, scores and comments are stored separately and are never touched by sync.
- **Stable identity per row:** Google Forms writes each response to a fixed row and updates that row in place if a respondent edits their answer (an edit also changes the Timestamp). In v1 the submission ID is the **sheet row number**. *(my call)* The team must not sort or delete rows in the "Form Responses 1" tab. The dashboard's admin help text says so ("use filter views instead"). If the builder finds a sturdier key cheaply, such as the Forms API `responseId`, they may use it instead.
- Rows that disappear from the sheet are **not deleted**. They're marked "removed from sheet" and hidden by default.
- Show "last synced at" in the UI.

### Data cleanup on import

- Trim whitespace on every value (the CSV has many trailing spaces in names, companies and links).
- Group speakers by **lowercased, trimmed email**. Two submissions with different emails are different speakers, which is accepted in v1.
- "Area of Expertise" = "Other (please specify)": show the "Other Area of Expertise" text instead. For the topic counter, count these under "Other".
- 2 rows have no session title. Import them anyway, flagged **"No session"**, so an admin can decline them or leave them be.
- Some rows (older form version) don't have the three consent columns. Show the consent answers as small labels in the speaker panel. When missing, show "not answered". This is informational only and blocks nothing.
- Links (LinkedIn, X, Instagram, GitHub) may be missing a scheme. Normalize them so they open correctly.

### Form columns (from the CSV header)

`Timestamp, First Name, Last Name, Email, Company, Job Title / Role, Phone Number, Bio, Are you a part of the Google Developer Experts Program?, LinkedIn, Twitter / X, Instagram, Github, Profile Photo, Speaker Experience, Why You Want to Speak at DevFest Istanbul 2026, Area of Expertise, Other Area of Expertise, Session Title, Session Abstract, Key Takeaways, Level, Session Language, Has this talk been presented before ?, Talk History, Do you have a Co-Speaker ? , Co-Speaker First Name, Co-Speaker Last Name, Co-Speaker Bio & Info, Co-Speaker Email, Co-Speaker Phone Number, Co-Speaker LinkedIn, Co-Speaker Twitter / X, Co-Speaker Instagram, Co-Speaker Profile Photo, Will you be traveling from outside of Türkiye ?, From where will you be joining us ?, Do you need transportation support ?, Do you need accommodation support ?, Pre-Conference Istanbul Tour Joining Status, Will you be joining from outside of Istanbul ? , Which city are you visiting us from?, Do you need any other requirements?, Speaker T-Shirt, After Party Participation, Anything you want to tell us?, Code of Conduct, Recording and publication, Personal data consent`

Column headers have inconsistent trailing spaces and question marks. Match columns by trimmed header text, so small header edits next year don't break the import.

**Profile photos** are Google Drive upload links, which are private to the form owner. Showing them inline in the dashboard is preferred. A reasonable approach is to give the service account access to the upload folder and have sync copy the images into Firebase Storage. If that proves awkward, a plain "Open photo ↗" link is acceptable for v1. *(left to builder, inline preferred)*

## Screens

### 1. Submissions list (home)

- A table of all submissions with: status, title, speaker name, topic, level, language, average score, score spread, number of comments, and a "+N other talks" marker when the speaker has more than one submission.
- Filters for status, topic, level and language, plus a search box (speaker name, title, company).
- Sort by average score, spread, or submission date.
- Clicking a row opens it in Meeting mode, keeping the current filter and sort.
- Refresh button and "last synced at".

### 2. Meeting mode (the main review screen)

Approved by the owner from the mockup (layout "A", with B's status counts added). A full-screen view of one submission, readable when projected.

- **Top bar:** status count labels `All 40 · Pending 25 · Maybe 5 · Approved 6 · Declined 4`. Clicking one **filters what Prev and Next step through**, so the meeting can work through Pending only. There are also Prev and Next buttons with "7 of 25" and **← → keyboard shortcuts**.
- **Topic balance row:** approved talk counts by topic, plus language and level. These count talks, not speakers.
- **Left (wider): the talk.** Status, topic, level, language, "presented before" (with talk history if any), title, abstract, key takeaways, co-speaker (if any), and comments with an "add comment" box.
- **Right: the speaker.** Photo, name, role and company, labeled links (LinkedIn / X / Instagram / GitHub), GDE yes or no, city or country, speaking experience, and expandable bio, "why DevFest Istanbul" and "anything to tell us". Below that, **their other submissions**, each with its status, clickable to jump to it.
- **Bottom bar:** "Your score" 1–5, the team score summary, and (admins only) **Approve / Maybe / Decline**.

### 3. Logistics (all members can view, CSV export)

- Lists **approved speakers** (one row per speaker), with approved talk title(s), email, phone, travelling from abroad and from where, joining from outside Istanbul and which city, transportation support, accommodation support, Istanbul tour, after party, T-shirt size, other requirements, and "anything to tell us".
- Co-speakers of approved talks are listed too, with the fields the form collects for them (name, email, phone). Their logistics fields are blank because the form doesn't ask them.
- **Export CSV** button.

### 4. Team (admins only)

- Waiting users with Approve and Reject buttons.
- Current members and admins, with Promote/Demote and Remove buttons.

### 5. Waiting screen

- Shown to signed-in, unapproved users: "Thanks, an admin needs to approve your access." It has a sign-out button.

## Scoring

- Each member (admins included) can give each submission one score, **1–5**, and change it. Scoring is optional.
- **You can't see the team's scores until you've scored that talk yourself**, to prevent anchoring. After scoring, you see the average, the number of scores, the spread (min–max), and each person's name with their score. *(my call: names visible after reveal)*
- Admins also can't see scores before scoring. They can still set a status without scoring. *(my call)*
- In the list, the average and spread are blank ("score to reveal") for talks you haven't scored. Talks you haven't scored sort last when sorting by score.
- **"Show all team scores" switch** (any member, remembered per browser): reveals every score on that screen. It's meant for the review meeting, after the team has scored ahead of time, so the projected list can be ranked by average and spread. *(my call)*
- Scores only inform the decision. They never set status automatically.

## Architecture

The owner chose Firebase. Specifics below are my defaults unless marked otherwise.

- **Firebase Hosting:** the web app.
- **Firebase Auth:** Google provider.
- **Cloud Firestore:** submissions (synced form data), per-submission review data (status and status history), scores, comments, users and roles, and sync metadata.
- **Cloud Functions (2nd gen, TypeScript):** `syncSheet` (on-call from the Refresh button, plus scheduled every 15 minutes) and admin helpers as needed (such as setting roles).
- **Blaze (pay-as-you-go) plan** is required for Functions and Scheduler. Expected cost at this volume is effectively zero.
- **Region:** a European region close to Istanbul, for example `europe-west1`. *(my call)*
- **Frontend:** React + Vite + TypeScript with plain CSS or a minimal component library. Nothing heavy. *(my call)* It must be readable when projected (large enough type, good contrast). Light and dark themes are optional.
- **Security rules:** Waiting users and signed-out visitors can read nothing except their own user doc. Members can read submissions, scores and comments, and can write only their own scores and comments. Only admins can write statuses and roles. Functions re-check roles.
  - The score reveal rule is mainly enforced in the UI, since Firestore rules can't easily express "readable once you've scored". A members-only leak of scores is acceptable. *(my call)*
- **Status history:** every status change records who changed it and when. It's shown as a small history under the status. *(my call)*
- **Secrets:** service account credentials live in Secret Manager or Functions config, never in the client bundle or the repo.
- **Local development:** use the Firebase Emulator Suite, seeded with made-up rows that match the form's columns.

## Setup steps the owner will need to do (document in the README)

1. Firebase project: **`speaker-dashboard-9c149`**, on Blaze with billing connected (done).
2. Create the service account. Share the response sheet (and optionally the photo upload folder) with it as Viewer.
3. Set the config: sheet ID and tab name.
4. Deploy, sign in once, and make yourself admin with the provided script.

## Left to the builder

- Firestore document shapes and collection names, as long as speakers stay grouped by email and status lives per talk, for Phase 2
- The exact component and library choices within "React + Vite + TS, nothing heavy"
- Inline photo handling (inline preferred, link acceptable)
- Whether to key submissions on the row number or a sturdier ID, as long as edits don't create duplicates and sync never loses review data
- Testing approach. At minimum, the sheet-to-submission mapping (header matching, cleanup, speaker grouping), the "sync never overwrites review data" rule, and the security rules (waiting user, member, admin) should have tests, because those are where the anti-goals live.

---

## Phase 2: Emails (parked)

*Not part of v1. Recorded here so the agreed rules aren't lost.*

**Open question that blocks Phase 2:** is the sending address a real, licensed Workspace mailbox (not a Group or alias), and can a Workspace admin grant domain-wide delegation? If not, the fallback is a one-time OAuth sign-in by the mailbox owner, with a stored refresh token.

- **Sender:** the team's shared Google Workspace address, using the Gmail API. The plan is a service account with domain-wide delegation (`gmail.send`) impersonating that address. Sent mail appears in that account's Sent folder, and replies go to its inbox.
- **One email per speaker**, decided by all their submissions together:
  - **Any talk Approved** → Approval email listing **only the approved** title(s).
  - **All talks Declined** → Decline email.
  - **Any talk Pending or Maybe** → not ready.
- **CC co-speakers:** the approval email CCs co-speakers of the approved talks. The decline email CCs co-speakers of the declined talks.
- **Outbox (admins only):** groups *Ready: approval*, *Ready: decline* and *Not ready*. Select speakers, pick a template, preview the exact email, send. Shows the result per speaker, and failures stay in the outbox.
- **Templates:** Approval and Decline, each with a subject and body, editable in the UI. Fill-ins are `{{firstName}}`, `{{lastName}}`, `{{talkTitles}}` and `{{talkCount}}`. Unknown placeholders block sending.
- **No double sends:** store email state per speaker (type, template version, time, sender, recipients, talk IDs covered). Sending happens on the server and is safe if clicked twice. The server recomputes the decision and refuses a template that doesn't match it.
- **Batch sends only reach speakers who have never been emailed.** Follow-ups after a decision changes (for example, declined then approved, or a second talk approved) are sent **one speaker at a time with an explicit confirmation**, listing only the newly approved talks.
- **"Mark as already emailed"** for speakers contacted outside the dashboard.
- **Co-speaker edge cases** (a co-speaker on a declined talk who is never notified, or a co-speaker who is also a main speaker elsewhere) are flagged for the admin to handle by hand.
- **"No session" and "removed from sheet" rows** are left out of readiness, titles and CC selection.
- **Email history** per speaker, shown in Meeting mode and the Outbox. Meeting mode shows a "speaker already emailed" banner.
- **Phase 2 anti-goal:** a speaker receives the wrong decision, contradictory emails, or the same email twice.
