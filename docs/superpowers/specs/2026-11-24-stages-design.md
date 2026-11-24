# Speaker stages (project 2)

## Why

Before the event, the team needs to know, at a glance, **whether every speaker has had every email they should have,
and which speakers need a follow-up**. Today that means reading Gmail and remembering. The email system (project 1)
already records every email per speaker and template, its state (sent, bounced, failed…) and its conversation (who
wrote last), so the answer can be worked out instead of remembered.

## What the owner decided (2026-11-24)

- Stages are the series of emails each approved speaker should receive, e.g. Acceptance → Presentation request →
  Event info → Day before. A stage can be skipped or added per speaker.
- **Follow-up** means: an email bounced, or the speaker replied and the team has not answered. No reply at all is not
  a follow-up on its own.
- **"Should have it"** is decided by a **due-from date per stage**: before the date nothing is flagged; on or after it,
  any speaker the stage applies to who has not had it is **missing**. A stage without a date is never flagged.
- Build approach 1: one stage list plus per-speaker exceptions, with the grid worked out live in the web app from data
  it already loads. Not a template field (approach 2), not a server-maintained status (approach 3).
- Next project after this is **B: AI reply assistant** (Gemini labels replies as needs-answer / no-answer-needed /
  withdrawing, and drafts reply suggestions). Not in this project, but this design leaves room: follow-up comes from one
  function that B can refine.

## Goals

- A **Stages** tab beside Emails, Templates and Event settings, showing one row per speaker and one column per stage.
- Admins manage the stage list: add, rename, reorder, remove; per stage: its template, its due-from date, and whether it
  applies to everyone or only to speakers it is added for.
- Admins skip a stage for a speaker (or undo it), and add an "only added speakers" stage for a speaker.
- Counts per stage and overall: sent, missing, needs follow-up. Filters: everyone / missing / needs follow-up.
- From the grid, send a stage to the speakers who are missing it, through the existing send flow with those speakers
  already ticked. Mark-as-already-sent works from the grid too.
- Members see everything; only admins change stages or exceptions or send.

## Non-goals

- AI reading of replies (project B). Checklists (project 3).
- Sending anything automatically when a stage becomes due. A person always presses Send.
- Stages for declined speakers (they get one decision email, already handled by project 1).
- Per-person reminders or notifications.

## Anti-goals (failure even if it works)

- A speaker shown as fine who is actually missing an email, or shown as missing who isn't (noise teaches people to
  ignore the view).
- The grid and the email history disagreeing about what was sent.
- Changing a stage's template making past sends disappear from it.

## Design

### Data

- **`meta/stages`**, one document holding the ordered list (one write reorders atomically):
  `stages: { id, name, templateIds: string[], dueFrom: 'YYYY-MM-DD' | null, appliesTo: 'everyone' | 'added' }[]`,
  plus updatedAt/By. `templateIds[0]` is the template the stage sends; earlier entries are templates the stage used
  before, so their sends still count when the stage's template is swapped.
- **`speakerStages/{speakerKey}`**: `{ skipped: stageId[], added: stageId[], updatedAt/By }`. Absent means no
  exceptions.
- Rules: members read both; admins write both, with shape checks like the other admin documents.

### Who appears

- Every speaker with at least one approved talk, plus anyone who has a sent acceptance but no approved talk now (shown
  with a "No approved talk now" marker, so a later decline after an acceptance is visible — this closes the open
  question from project 1).

### A cell (speaker × stage)

Work out which of these applies, top first:

1. **Not for this speaker**: skipped for them, or an "added" stage they were not added to. Shown faint ("Skipped" or
   blank).
2. Take the speaker's emails whose template is in the stage's `templateIds` (including manual "already emailed" and
   imported ones); use the latest one by sent or scheduled time.
   - **Bounced** → needs follow-up.
   - **Failed / unknown / held** → needs follow-up ("Problem").
   - **Sent, speaker wrote last in its conversation** → needs follow-up ("Replied, needs an answer").
   - **Sent, replied and answered** → "Replied".
   - **Sent** → "Sent {date}" ("Marked sent {date}" for manual).
   - **Scheduled / queued / sending** → "Scheduled {date}" / "Sending".
3. No email: if today (Istanbul date) is on or after `dueFrom` → **Missing**; otherwise "Due {date}", or blank when
   there is no date.

The cell logic is one pure function shared by the grid and the counts, with unit tests for every row of this list.

### The Stages tab

```
Stages                                             [Manage stages]   (admins)
All 24 · Missing 3 · Needs follow-up 2

            Acceptance     Presentation req.     Event info      Day before
            24 sent        20 sent · 2 missing   due 1 Dec       due 11 Dec
Abdel S.    ✓ 4 Nov        ↩ needs an answer     Due 1 Dec       Due 11 Dec
Kadriye M.  ✓ 4 Nov        ✗ Missing             Due 1 Dec       Due 11 Dec
Vadym P.    ✓ 4 Nov        ⚠ Bounced             Due 1 Dec       Due 11 Dec
Serhan Y.   ✓ 4 Nov        Skipped               Due 1 Dec       Due 11 Dec
```

- Clicking a sent cell opens that email's conversation (the existing sheet). Clicking a missing cell offers
  "Send {stage}", "Mark as already sent", "Skip for this speaker". Column header: "Send to the N missing".
- Filters: All / Missing / Needs follow-up; rows sort with problems first.
- Manage stages: a small editor (name, template picker, due-from date, applies to) with up/down reorder.
- Follows DESIGN.md; email states use the existing neutral chips; missing and follow-up use the same warning style the
  Emails page uses for "Needs a look".

### Sending from the grid

The send flow gains a way to arrive with several speakers pre-ticked (today it accepts one via `?speaker=`). Everything
else about sending (eligibility, preview, follow-ups, one copy per template) is unchanged; a speaker the template
refuses shows the usual reason.

### Mockups first

As in project 1, a mockup of the Stages tab and the Manage stages editor goes to the owner before building.

## Calls made after the builder check (Claude's calls)

1. **Template `stageId`** (from project 1) stays unused and null; `meta/stages` is the only source of truth.
2. **Cancelled emails** are ignored when picking a cell's email.
3. **Which email decides a cell:** if any email for the stage was sent and did not bounce, the latest such one decides
   (a later failed retry or an old bounce doesn't override a successful send). Otherwise the latest email by sent or
   scheduled time decides.
4. **"Speaker wrote last"** is per email: the email's thread has `lastReplyAt` after `lastTeamAt`. The grid loads
   threads (the web app already does). Manual "already emailed" entries have no thread and are never "replied". A
   reply that needs an answer stays on that stage's cell until someone answers in that conversation.
5. **Applies vs. eligibility:** an "everyone" stage applies to every speaker in the view. If the stage's template would
   refuse a speaker, the cell still shows Missing and the send flow shows the reason; the admin can skip the stage for
   them.
6. **Dangling ids:** exceptions pointing at a removed stage are ignored. A stage whose template was deleted shows
   "Template deleted" in its header and can't send; its past sends still count.
7. **Members** don't see the Send / Mark / Skip / Manage controls (and the rules refuse their writes anyway).
8. **Due dates** are checked against a live clock (the app's existing `useNow`), so a stage becomes due at midnight
   Istanbul time without a reload.

## Left to the builder

- Exact component split, how the send flow receives several speakers, mobile layout of the grid (horizontal scroll
  with a sticky speaker column is the expected default).
- Whether a CC'd co-speaker counts as having received a stage. *Claude's call: yes when the co-speaker is also a
  speaker and was on the email's CC.*
- Seed data for the emulator: three stages, one with a past due date.
