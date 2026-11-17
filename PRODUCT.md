# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The DevFest Istanbul (GDG Istanbul) organizing team: a small group of volunteer organizers reviewing the
Call for Papers. Two roles: members (review, score, comment) and admins (lead organizers who also set
the decision and manage the team). Confirmed 2026-11-17: mostly used on each organizer's own laptop,
scoring and commenting alone ahead of the review meeting; projecting in the meeting is occasional.

## Product Purpose

Replaces the Google Sheet as the place where CFP review happens. Submissions sync in from the Google
Form's response sheet (and Advocu CSV imports); the team reads each talk and its speaker, scores 1-5,
comments, and admins mark each talk Pending, Maybe, Approved or Declined. Success: the whole review runs
from the dashboard, and decisions are recorded cleanly enough for the parked decision-email phase.

## Positioning

A private internal tool for one conference's CFP, built around how this team reviews: talk and speaker
judged together, one speaker's several talks grouped, scores hidden until you score (no anchoring),
and a meeting flow that steps through talks in a filtered order.

## Operating Context

- Organizers work through the list on their own laptops, then meet to walk through talks with Prev/Next
  and the ← → keys, filtered by status (e.g. only Pending).
- Screens: Submissions list, Talk page (meeting mode), Topic map, Logistics (approved speakers, CSV
  export), Team (admins), Import (Advocu CSV, admins).
- Gemini writes a short overview per talk and finds similar talks; both are aids, never decisions.

## Capabilities and Constraints

- Statuses: Pending (default), Maybe, Approved, Declined. Scores 1-5 per member, revealed after you
  score, or with "Show all team scores".
- Speaker contact details (email, phone, social links) belong on the talk page only, not in the list
  (confirmed 2026-11-17). Personal data must never be reachable outside approved team members.
- The list shows company; the language column is dropped from the list (confirmed 2026-11-17).
- Stack: React + Vite + TypeScript, plain CSS, Firebase. Nothing heavy, no animation libraries.
- Data volume: tens to low hundreds of submissions per year.

## Brand Commitments

Owner's words from the original spec: "nothing too fancy, the dashboard needs to just work." No
heavy UI frameworks, no gratuitous animation.

## Evidence on Hand

Real submissions contain personal data and must not appear in mockups or the repo. Use made-up
speakers in the shape of `functions/src/testing/fakeRows.ts`.

## Product Principles

1. The talk and the speaker are judged together; neither screen hides the other.
2. The next talk to review is always one step away; never lose your place in the list.
3. Decisions and scores are the only loud things; everything else is reference.
4. Quiet by default: one way to show a status, one way to show a tag.

## Accessibility & Inclusion

Readable on a projector when it is used (contrast, type size). Keyboard stepping (← →) must keep working.
