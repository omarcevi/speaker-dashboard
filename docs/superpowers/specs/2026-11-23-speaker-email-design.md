# Speaker email: templates, sending and replies

Date: 2026-11-23. Owner-confirmed in conversation unless marked *(Claude's call)*.
Replaces the parked "Phase 2: Emails" section of `2026-10-29-speaker-dashboard-design.md`; the rules from there that still hold are restated here.

## Intent

Today decision and follow-up emails go out by hand, outside the dashboard, and nobody can see who got what. The team wants to email speakers from the dashboard, from stored templates or written on the spot, and see for every email whether it was sent, bounced or answered, and read the answer. Speakers move through stages (Acceptance, Presentation request, Event info, Day before, …) defined by which email they have had; some stages leave a follow-up open, such as chasing slides.

## Three projects, built in this order

1. **Templates and sending** (this document, in full): templates, event fill-ins, preview and test send, the send queue with scheduling, per-speaker email history with sent / bounced / replied, full replies readable and answerable in the dashboard.
2. **Stages** (outline below, its own design later): a team-wide ordered stage list, each tied to a template; per speaker a stage can be added or skipped.
3. **Checklists** (outline below, its own design later): per-speaker to-dos; a stage can add items; an open item can send a reminder.

Project 1 must leave room for 2 and 3 without rework: every sent email records the template it came from, and templates carry an optional stage id field from day one (unused until project 2).

## Goals (project 1)

- A **Templates** section: list, create, edit, duplicate, delete templates. Each has a name, subject, body and optional attachments, and uses fill-ins.
- Send a template to one speaker or to many, now or at a set time, after previewing the exact email each person will get and optionally sending a test to yourself.
- Write a one-off custom email to a speaker (a blank template not saved to the list).
- Per speaker, an **email history**: every email with its state (scheduled, sent, bounced, replied, failed), and the full conversation including replies.
- Reply to a speaker from the dashboard, landing in the same Gmail conversation.

## Non-goals

- Delivered and opened tracking. The owner accepted sent, bounced and replied (2026-11-23). No tracking pixel.
- A general inbox. Only conversations the dashboard started are read.
- Marketing features: unsubscribe links, campaigns, analytics.
- Stages and checklists (projects 2 and 3).

## Anti-goals (failure even if it works)

- A speaker gets the wrong decision, contradictory emails, or the same email twice.
- A send goes out with an unfilled or wrong fill-in.
- Speaker email or replies readable by anyone who is not an approved team member.
- An email is re-sent automatically after a crash, without anyone knowing whether the first one went out.

## Constraints

- Sender: the team's **Google Workspace mailbox** (a real licensed user, not a Group or alias: owner confirmed 2026-11-23), via the **Gmail API**, using a **service account with domain-wide delegation** granted by the Workspace admin (owner confirmed admin access, 2026-11-23). Scopes: `gmail.send` and `gmail.readonly`. The mailbox address is a config param, never hardcoded.
- Sent mail appears in that mailbox's Sent folder; replies arrive in its inbox as usual. The dashboard adds nothing to Gmail beyond the messages it sends.
- Workspace sending limit (2,000/day) is far above this team's volume; batches still send one message at a time.
- Existing stack only: Firebase Functions (europe-west1), Firestore, Storage, React web app, `googleapis` already installed. Works in the emulator with a fake Gmail client, the way `fakeAiClient` stands in for Gemini.
- No real speaker data in tests, fixtures, mockups or logs.

## Who can do what

- **Admins:** create and edit templates and event settings, send, schedule, cancel scheduled sends, reply. *(Claude's call, owner did not object.)*
- **Members:** read templates, email history and full replies (owner, 2026-11-23: "everyone on the team can read them"), download reply attachments.
- Waiting and removed users: nothing.

## Approaches considered

**Sending service.** Gmail API from the Workspace mailbox *(chosen)* vs a transactional provider (Resend, Postmark). The provider adds delivered and opened, but needs DNS setup and sends speaker data to a third party. The owner chose Gmail: sent, bounced and replied is enough.

**Access to the mailbox.** Domain-wide delegation *(chosen)*: no expiring tokens, survives people leaving. The alternative, the mailbox owner signing in once with a stored refresh token, breaks when they change their password.

**How emails go out.** A queue *(chosen)*: every send, immediate or scheduled, is a document in Firestore; a scheduled function sends what is due every minute. One path for now, scheduled, batches and retries, with one place for the no-double-send rule. Rejected: sending directly from the click, with a separate path for scheduled email.

**Noticing replies and bounces.** Check the mailbox every 5 minutes *(chosen)*, only the conversations the dashboard started. Rejected: Gmail push notifications via Pub/Sub, which need a weekly renewal; minutes of delay don't matter here.

## Design

### Templates

- Fields: name, subject, body, attachments (files in Storage), optional `stageId` (null until project 2), `recipients` rule (below), updated by / at.
- Body is plain text with paragraphs and auto-linked URLs. Sent as multipart: plain text plus a simple HTML version with the same content. *(Claude's call: no rich-text editor; keeps the stack light and the preview exact.)*
- **Fill-ins** in `{{name}}` form:
  - Speaker: `{{firstName}}`, `{{lastName}}`, `{{fullName}}`.
  - Talks: `{{talkTitles}}` (bulleted list), `{{talkCount}}`, `{{coSpeakerNames}}`. Which talks count depends on the template's recipients rule: approved talks for an acceptance, declined talks for a decline, otherwise all of the speaker's active talks.
  - Event: any key from **Event settings** (below), e.g. `{{eventDate}}`, `{{venue}}`.
- An unknown fill-in, or a known one that is empty for a recipient, **blocks** that recipient's send and says which fill-in and why. Saving a template with an unknown fill-in shows a warning.
- Attachments: total per email at most 20 MB (Gmail's limit is 25 MB including encoding). *(Claude's call.)*
- The two decision templates (Acceptance, Decline) are seeded on first run with placeholder text for the team to edit.

### Event settings

A small admin page of key/value pairs (name shown, key used as fill-in), e.g. event name, date, venue address, speaker check-in time. Changing a value changes every future email that uses it; already-sent emails keep what they said.

### Who an email goes to

- The unit is the **speaker** (grouped by `speakerKey`, as everywhere else). One email per speaker covers all their relevant talks.
- **CC co-speakers** of the talks the email covers, on by default for every template, switchable per send. *(Carried over from Phase 2.)*
- **Decision readiness**, carried over from Phase 2, applies to templates whose recipients rule is *acceptance* or *decline*:
  - any talk Approved → can get the acceptance, listing only approved talks;
  - all talks Declined → can get the decline;
  - any talk Pending or Maybe and none approved → not ready; the send flow shows them as not ready and won't include them.
  - The server recomputes this at send time and refuses a mismatch (e.g. status changed since the batch was queued).
- **Recipients rule** on every template: *acceptance*, *decline*, *approved speakers* (default for new templates: Event info, Day before and the like go only to speakers with at least one approved talk, listing approved talks), or *anyone* (for one-off emails, e.g. asking an undecided speaker a question). The server checks the rule at send time like readiness. *(Claude's call.)*
- "No session" and "removed from sheet" submissions are left out of talk lists, readiness and CCs.
- Co-speaker edge cases (a co-speaker who is also a main speaker elsewhere; a co-speaker on a declined talk of an otherwise accepted speaker) are flagged in the preview for the admin to handle by hand.

### The send flow

1. From a template ("Send…") or from a speaker's talk page ("Email speaker").
2. Pick recipients: a list of speakers with filters (status, already got this template or not). Speakers who already got this template are unticked by default and marked.
3. Preview: the exact rendered email per recipient (to, cc, subject, body, attachments), stepping through them. Blocked recipients are listed with the reason.
4. Optional **Send test to me**: sends the first recipient's rendered email to the admin's own address, subject prefixed `[TEST]`, not recorded in history.
5. Choose **Send now** or **Schedule** (date and time, Istanbul time). Confirm with a count: "Send to 14 speakers".
6. The emails are queued; the page shows each one moving to sent or failed.

**No double sends.**
- A speaker who already has a *sent* email from the same template needs an explicit per-speaker confirmation to get it again; batches never include them silently.
- **Decision emails** (acceptance and decline rules): a batch never includes a speaker who already got *any* decision email. Every sent email records the talk ids it covered. When a decision changes afterwards (declined then approved; a second talk approved), the speaker appears in a **Needs a follow-up** list; follow-ups go one speaker at a time with an explicit confirmation, and `{{talkTitles}}` lists only the talks not covered before. (Owner confirmed, 2026-11-23.)
- Queue documents have deterministic ids per (batch, speaker), so a double-clicked confirm creates nothing new.
- The sender claims a queued email in a transaction (`queued` → `sending`) before calling Gmail, and records `sent` with the Gmail message and thread id after.
- If an email is stuck in `sending` (crash between Gmail and Firestore), it becomes **`unknown`**, never retried automatically. The history shows "May have been sent, check Gmail Sent", with buttons *Mark as sent* and *Send again*.
- Failed sends (Gmail error) stay visible as `failed` with the error, and can be retried by hand.
- Scheduled emails can be cancelled, re-timed or have recipients removed until they start sending. *(Claude's call.)*
- **When the email is written.** "Send now" sends exactly what was previewed. A scheduled email is written at send time, so event-setting and template edits made meanwhile apply. If a recipient no longer qualifies or a fill-in is now empty, that email is **held**, not sent and not failed, and admins see "Held: needs a look" with the reason. *(Claude's call.)*

**Mark as already emailed** for speakers contacted outside the dashboard: records a manual history entry for a template (and the talks it covered) without sending. Works for one speaker or **in bulk** from the recipient list. Some acceptance emails have already gone out by hand this season (owner, 2026-11-23), so bulk marking ships in project 1 and the first Acceptance send flow prompts: "Have some of these already been emailed outside the dashboard?" 

### Email states

`scheduled` → `queued` → `sending` → `sent` | `failed` | `unknown`; a sent email can later gain `bounced` (with the bounce reason) and `replied` (with reply count and last reply time). Bounced and replied are flags on a sent email, not replacements.

### Replies and bounces

- Every 5 minutes a scheduled function looks at the Gmail threads of emails sent in the last 90 days *(Claude's call)* and fetches new messages in them.
- A message from a mailer daemon / delivery status notification marks the email **bounced** with the reason text.
- Any other message not sent by the mailbox itself is a **reply**: stored in full (from, to, cc, date, subject, body as plain text with HTML converted to safe text, quoted earlier messages detected and folded in the UI), plus attachment names and sizes. Attachment files are not copied; members download them on demand through a function that fetches them from Gmail.
- Replies sent by team members directly from Gmail in those threads also show up, marked as from the team.
- Stored replies stay even if deleted in Gmail.

### Replying from the dashboard

A reply box under a conversation (admins). Sends in the same Gmail thread with correct `In-Reply-To` / `References`, through the same queue, recorded in the history like any other email (template: none).

### Where things show

- **Emails** in the sidebar for everyone, with three tabs: **Conversations**, **Templates**, **Event settings**. Members see all three read-only. (Owner approved the mockups, 2026-11-23.)
- **Conversations** lists every email (speaker, which email, latest activity line, state, sent by and when), newest activity first, with filters: **Needs a look** (default: the speaker wrote after the team's last message, or bounced, held, or may have been sent), All, Replied, Bounced, Scheduled. A row opens the conversation.
- **A conversation** opens in a side panel over the page (on the Emails page and on the talk page alike): our emails and replies in time order, quoted text folded, attachments downloadable, bounce shown as a notice, admin reply box at the bottom. Replies a team member sent straight from Gmail appear marked "(from Gmail)".
- **Talk page, speaker card:** email history for that speaker (state chips, latest first), expandable to the full conversation, plus "Email speaker".
- **Meeting mode:** a quiet "Emailed: Acceptance, 20 Nov" line on the talk header so the room knows. *(Phase 2 rule.)*
- **Submissions list:** no new column. *(Claude's call: the list stays uncluttered; stages in project 2 will add the one useful column.)*
- Design follows DESIGN.md (DevFest Colours). Email states use neutral chips, not the four status colours, which stay reserved for review status. *(Claude's call, per "one way to show a status".)*

### Data and security

- New collections, names left to the builder: templates, event settings, outgoing emails (queue and history in one), received messages, batch records.
- Rules: members read all of it; admins write templates and event settings; **everything about sending and receiving is written by functions only** (sending goes through a callable that checks the admin role, like Advocu import).
- The service account key / delegation identity is never exposed to the client.
- Logs never contain email bodies, addresses or reply text: counts and ids only.

### Setup the owner must do (handed over as steps, not automated)

1. Create or pick a service account, and in the Workspace admin console grant it domain-wide delegation for `gmail.send` and `gmail.readonly`.
2. Set the sender address and service account as function params.
3. Deploy.

## Project 2 outline: Stages

- A team-wide ordered list of stages (e.g. Acceptance, Presentation request, Event info, Day before), each tied to one template. Admins can add, rename, reorder and remove stages.
- A speaker's current stage is the latest stage whose template they were sent. Per speaker, admins can skip a stage or add an extra one.
- The list (or a new Speakers view) shows each speaker's stage and what's next; sending the next stage is one step.

## Project 3 outline: Checklists

- Per-speaker to-do items, added by hand or automatically when a stage is sent (e.g. the presentation request adds "Slides received").
- Items are ticked by hand; an open item can send a reminder email from a template.
- Separate from stages: a speaker can be at "Event info" with "Slides received" still open.

## Mockups

`docs/mockups/2026-11-23-email/` (approved 2026-11-23): `emails.html`, `templates.html`, `template.html`, `event.html`, `send.html` (with `?t=decline`, `?t=acceptance&follow=gizem`, `?custom=1`), `talk.html`. They build on the UI-refresh mockups and use made-up speakers.

## Left to the builder

- Collection names and document shapes, within the rules above.
- How the 5-minute check finds new messages (per-thread fetch or Gmail history API).
- HTML-to-text conversion and quote detection approach.
- Exact layout of the Templates, send flow and history UI within DESIGN.md.
- Testing approach. At minimum: fill-in rendering and blocking, decision readiness, the no-double-send claim and the `unknown` state, bounce vs reply classification, and the security rules.
