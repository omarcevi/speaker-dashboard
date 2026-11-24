# Speaker Dashboard

The DevFest Istanbul 2026 team uses this dashboard to review CFP submissions. Speakers fill in the Google Form, and their responses land in the "Form Responses 1" tab of the response sheet. A Cloud Function copies that sheet into Firestore every 15 minutes, and also whenever someone presses **Refresh**. Team members sign in with Google. They score talks, comment, and step through them in meeting mode. Admins set **Approve / Maybe / Decline** and manage who has access.

Stack: React + Vite (`web/`), Cloud Functions 2nd gen on Node 22 in `europe-west1` (`functions/`), Firestore, Storage, Hosting and Auth (Google provider).

Admins can also email speakers from the dashboard (acceptance, decline and other templates), and replies and bounces show up there. See [Email setup](#email-setup) and `docs/superpowers/specs/2026-11-23-speaker-email-design.md`.

## Local development

Everything runs against the Firebase emulators under the fake project `demo-cfp`, using fake speaker data. The local setup never touches the real project or the real sheet.

**Prerequisites:** Node 22 and Java 21 on your `PATH`. Java is needed for the Firestore emulator. With Homebrew:
`export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"`

```bash
npm install && npm install --prefix functions && npm install --prefix web
```

Create two local env files. Git ignores both.

- `functions/.env.local`:
  ```
  SHEET_ID=fake
  SHEET_TAB=Form Responses 1
  SYNC_SERVICE_ACCOUNT=cfp-sync@demo-cfp.iam.gserviceaccount.com
  ```
  `SHEET_ID=fake` makes Refresh read the built-in fake sheet instead of Google Sheets.
  The emulator never sends real email: it uses an in-memory fake Gmail, and `MAIL_SENDER` defaults to `speakers@example.org`.
- `web/.env.local`:
  ```
  VITE_FIREBASE_API_KEY=dummy
  VITE_FIREBASE_AUTH_DOMAIN=localhost
  VITE_FIREBASE_PROJECT_ID=demo-cfp
  VITE_FIREBASE_STORAGE_BUCKET=demo-cfp.appspot.com
  VITE_FIREBASE_APP_ID=dummy
  VITE_USE_EMULATORS=true
  ```

Then run each of these in its own terminal:

```bash
# 1. Emulators (Emulator UI at http://localhost:4000)
npm run build --prefix functions
npx firebase emulators:start --only auth,firestore,functions,storage --project demo-cfp

# 2. Seed: 12 fake Form rows, 3 fake Advocu applications, 3 users, fake AI results,
#    the email templates, three stages and a few sample emails (a sent acceptance with a reply, a bounce, a scheduled email)
cd functions && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/seed-emulator.ts

# 3. Web app at http://localhost:5173
npm run dev --prefix web
```

The seed script refuses to run unless the emulator host variables are set. Run it once after each fresh emulator start. In the emulator's Google sign-in popup, pick one of these seeded accounts:

| Account | Role |
|---|---|
| `admin@example.com` | admin |
| `member@example.com` | member |
| `waiting@example.com` | waiting |

Choose "Add new account" to test the sign-up flow.

To preview an inline speaker photo, upload any small PNG or JPEG to `photos/FAKEPHOTO1` in the Storage tab of the Emulator UI.

### Tests

```bash
npm test --prefix web                 # web logic
npm test --prefix functions           # sheet parsing, sync planning, photo copying
npm run test:emulator --prefix functions   # sync + role checks against the emulators
npm test                              # Firestore and Storage security rules
```

Stop any running emulators before you run the emulator-backed suites, because they use the same ports.

## Setup for the owner (first deploy)

You do these steps once, in the Firebase and Google Cloud consoles.

1. **Firebase project.** The project is `speaker-dashboard-9c149`, on the Blaze plan.
   - Create Firestore and Storage if they don't exist yet. Pick a **European location**, such as `eur3` or `europe-west1`. You can't change the location later.
   - In Authentication → Sign-in method, enable the **Google** provider.
2. **APIs.** In Google Cloud console → APIs & Services, enable the **Google Sheets API** and the **Google Drive API**.
3. **Service account.** Create a service account named `cfp-sync`. Grant it `roles/datastore.user` and `roles/storage.objectAdmin`. Give whoever runs `firebase deploy` the role `roles/iam.serviceAccountUser` on that account, so the functions can run as it. No key files are needed, so never download one.
4. **Share with the service account.** Share the response sheet with `cfp-sync@speaker-dashboard-9c149.iam.gserviceaccount.com` as **Viewer**. Nothing else needs sharing. Profile photos are links in the sheet: Google Drive files shared as "Anyone with the link" get copied, and any others show an "Open photo ↗" link.

   **Never use "Publish to web"** on the sheet. It holds personal data.
5. **Config files.** Git ignores both.
   - `functions/.env`:
     ```
     SHEET_ID=<the id from the sheet URL: docs.google.com/spreadsheets/d/<SHEET_ID>/edit>
     SHEET_TAB=Form Responses 1
     SYNC_SERVICE_ACCOUNT=cfp-sync@speaker-dashboard-9c149.iam.gserviceaccount.com
     ```
   - `web/.env.production`: copy the `VITE_FIREBASE_*` values from Firebase console → Project settings → Your apps → Web app (create a web app there if there isn't one), and set `VITE_USE_EMULATORS=false`.
6. **AI assist (Vertex AI).**
   - Where it runs: overviews and topic names use Gemini 3.8 Flash on the Vertex AI **EU multi-region**, and embeddings use `gemini-embedding-001` in **europe-west1**. Everything stays inside the EU.
   - Enable the Vertex AI API: `gcloud services enable aiplatform.googleapis.com --project speaker-dashboard-9c149`.
   - Grant `cfp-sync` the role `roles/aiplatform.user`.
   - **Check:** confirm that the CFP's personal-data consent covers AI-assisted review with processing in the EU. The current form asks for consent "to review your submission". Consider adding an AI-transparency line to next year's form.
7. **Deploy:**
   ```bash
   npx firebase login
   npm run build --prefix web && npx firebase deploy --project speaker-dashboard-9c149
   ```
   The first deploy may ask to grant the Storage service a role so `storage.rules` can read user roles from Firestore. Accept it. Cloud Scheduler is enabled automatically for the 15-minute sync.
8. **Make yourself admin.**
   - Open the hosted URL and sign in once. You'll land on the Waiting screen.
   - Then run:
     ```bash
     gcloud auth application-default login
     cd functions && GOOGLE_CLOUD_PROJECT=speaker-dashboard-9c149 npx tsx scripts/make-admin.ts you@example.com
     ```
   - No CLI? In the Firebase console, go to Firestore → `users` → your document and set `role` to `admin`.
   - Reload the page. From then on, approve everyone else from the **Team** page.

## Email setup

Emails go out through a real Workspace mailbox, using the `cfp-sync` service account with domain-wide delegation. No key file is needed. Two settings decide the addresses:

- `MAIL_USER`: the real Workspace user the dashboard signs in to. It sends from this mailbox and reads replies and bounces there.
- `MAIL_SENDER`: the From address speakers see. It's either the same address, or a Google Group that `MAIL_USER` belongs to and has added under Gmail **Settings → Accounts → Send mail as**. Without that alias, Gmail replaces the From address with `MAIL_USER`. If it's a group, remove any subject prefix in the group's **Email options**, because a prefix stops replies from joining their conversation in the dashboard.

The owner does these steps once:

1. **Enable the APIs:** the **Gmail API** and the **IAM Service Account Credentials API**.
   ```bash
   gcloud services enable gmail.googleapis.com iamcredentials.googleapis.com --project speaker-dashboard-9c149
   ```
2. **Let `cfp-sync` sign for itself.** Grant the sync service account `roles/iam.serviceAccountTokenCreator` on itself:
   ```bash
   gcloud iam service-accounts add-iam-policy-binding cfp-sync@speaker-dashboard-9c149.iam.gserviceaccount.com \
     --member=serviceAccount:cfp-sync@speaker-dashboard-9c149.iam.gserviceaccount.com \
     --role=roles/iam.serviceAccountTokenCreator --project speaker-dashboard-9c149
   ```
3. **Domain-wide delegation.** Get the service account's client id (a number):
   ```bash
   gcloud iam service-accounts describe cfp-sync@speaker-dashboard-9c149.iam.gserviceaccount.com --format='value(oauth2ClientId)'
   ```
   As a Workspace super admin, open the Google Admin console (admin.google.com) → **Security** → **Access and data control** → **API controls** → **Manage domain-wide delegation** → **Add new**. Paste the client id and these two scopes, comma-separated, exactly:
   ```
   https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.modify
   ```
   `gmail.modify` lets the dashboard read replies and put its label on the emails it sends. The dashboard never archives, trashes or deletes mail.
4. **Set the addresses** in `functions/.env`:
   ```
   MAIL_USER=<the Workspace user the dashboard signs in to>
   MAIL_SENDER=<the From address: the same user, or a group it can send as>
   ```
   Every email the dashboard sends gets the Gmail label **Speaker Dashboard** in `MAIL_USER`'s mailbox, created on the first send. Search `label:speaker-dashboard` to see those conversations, replies included. To use another name, set `MAIL_LABEL`.
5. **Deploy** the functions, rules and the web app (the Emails pages are in it) when ready:
   ```bash
   npm run build --prefix web
   npx firebase deploy --only functions,firestore:rules,storage,hosting --project speaker-dashboard-9c149
   ```
   This adds the send queue (every minute) and the reply check (every 5 minutes). Within a minute, the send queue creates the **Acceptance** and **Decline** templates with placeholder text, and empty event settings (event name, date, venue). Fill in the event settings and edit the templates before sending.
   After any deploy, admins reload open dashboard tabs, so their editor and previews match what the server now sends.

### Stages

**Emails → Stages** shows, for each speaker, which emails of each stage (for example Acceptance, Event info) have been sent. **Missing** means the stage is due and nothing was sent yet. **Needs follow-up** means the speaker replied and the reply has not been answered. Everyone on the team can see the tab. Admins send from it, mark a stage as done or skip it for one speaker, add a stage to one speaker, and manage the stages under **Manage**. Nothing is ever sent automatically: every email is sent by an admin.

**Team signature and images.** Emails are sent as HTML, and plain text is included for mail apps that need it. The team signature is edited under **Emails → Event settings** (Team signature). It is added to the end of every email, replies included, so leave it out of the templates. For a layout like a Gmail signature (logo, divider, coloured text), switch the editor to **HTML** and paste the signature's HTML; tables and basic inline styles are kept. Fill-ins work in it too, and an empty one blocks the email like one in the body. Images are uploaded in the editor (admins only, PNG, JPEG, GIF or WebP under 5 MB). They are stored in Firebase Storage under `emailImages/` and linked by their download URL, so deploy `storage` too. The previews show the exact HTML that is sent. Outlook may ask readers to show images, so don't rely on an image for anything important.

Locally, the emulator also has two admin-only callables for testing: `devInjectMail({ threadId, kind: 'reply' | 'bounce', text })` adds a fake reply or bounce to a thread, and `devRunMail()` runs the send queue and the reply check once. Neither is deployed.

## Reply assistant

The reply assistant helps the team with speaker replies in **Emails**. Each new reply is read with the Gemini Decisions API (`gemini-decision-1`). A reply that very clearly needs no answer (a thank-you, say) goes to **Cleared by AI**, where anyone can press **Undo**. A reply that may be a withdrawal gets a warning. For replies that need an answer, the assistant drafts one with Gemini on Vertex AI (EU), using the **Speaker facts** and fields under **Event settings**, the templates, the speaker's talk and their own conversation. Nothing is ever sent automatically: an admin reviews and sends every draft.

**Setup.** The reading needs an API key from an AI Studio project with billing turned on, so the text is not used for training:

```bash
npx firebase functions:secrets:set GEMINI_API_KEY --project speaker-dashboard-9c149
```

Deploying grants the functions' service account access to the secret. Drafts use Vertex AI and need no extra key.

**Cut-offs.** They are in `functions/src/shared/replyAi.ts`: a reply is cleared when "no answer needed" is at least 0.95 and "withdrawing" is under 0.10, and it is flagged as a possible withdrawal from 0.30.

**No backfill.** Only replies that arrive after the deploy are read. Older conversations stay as they are.

Locally, the seed script adds three sample conversations (needs answer with a draft, cleared by AI, withdrawing) and the emulator uses fake clients, so nothing calls Google.

## AI assist

Three features help reviewers get through the talks faster:

- **Overview.** A short, foldable summary above the talk title in meeting mode. Admins can press **Regenerate** to redo one talk.
- **Similar talks.** A panel in the talk column that lists related talks.
- **Topic map.** The **Topic map** page (`/map`) draws every talk as a dot, grouped into clusters by topic. Click a dot to open the talk.

The overview is based only on what the speaker wrote, and AI never decides anything. Scores, comments and Approve / Maybe / Decline stay with the team.

**Privacy.** Overviews and topic names use Gemini 3.8 Flash on the Vertex AI **EU multi-region**, and embeddings use `gemini-embedding-001` in **europe-west1**. Everything stays inside the EU, in the same Google Cloud project. Only the talk text and the speaker's bio, experience, company and job title are sent (plus country, city, session type and participation for Advocu applications). Names, emails, phones, links, photos, logistics and consent are never sent.

**Refresh.** New and edited talks get overviews every 15 minutes. The first full run can take up to about 30 minutes.

Locally, the seed script and the Regenerate button use a fake, deterministic client, so the emulator never calls Vertex AI.

## Advocu applications

Some speakers apply through Advocu instead of the Form. An admin imports those by hand.

1. In Advocu, export the applications as CSV.
2. Sign in as an admin and open the **Import** page. Upload the CSV and check the preview, especially the hidden count.
3. Press **Import N applications** to import.
4. **Never commit or share the export.** It holds personal data.

## Team rules

- **Don't sort or delete rows in the "Form Responses 1" tab.** Each submission's id is its row number, so moving rows mixes up reviews, scores and comments. Use filter views to look at the data.
- If someone edits their form response, the change shows up on the next sync. The talk keeps its scores, comments and decision.
- A talk whose row disappears from the sheet is hidden and marked as removed, not deleted. Tick "Show removed rows" on the list to see it.
- **Opening the logistics CSV:**
  - **Google Sheets:** File → Import → Upload. Under "Convert text to numbers, dates, and formulas", choose **No**. This keeps `+90 …` phone numbers as text and stops any formula from running.
  - **Excel:** Data → From Text/CSV.

  Double-clicking the file in Turkish-locale Excel splits columns on `;`.
