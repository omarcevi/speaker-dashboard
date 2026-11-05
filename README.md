# Speaker Dashboard

The DevFest Istanbul 2026 team uses this dashboard to review CFP submissions. Speakers fill in the Google Form, and their responses land in the "Form Responses 1" tab of the response sheet. A Cloud Function copies that sheet into Firestore every 15 minutes, and also whenever someone presses **Refresh**. Team members sign in with Google. They score talks, comment, and step through them in meeting mode. Admins set **Approve / Maybe / Decline** and manage who has access.

Stack: React + Vite (`web/`), Cloud Functions 2nd gen on Node 22 in `europe-west1` (`functions/`), Firestore, Storage, Hosting and Auth (Google provider).

Sending email is not part of v1. See "Phase 2: Emails (parked)" in `docs/superpowers/specs/2026-10-29-speaker-dashboard-design.md`.

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

# 2. Seed: 12 fake submissions, 3 users and fake AI results
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
   - Enable the Vertex AI API: `gcloud services enable aiplatform.googleapis.com --project speaker-dashboard-9c149`.
   - Grant `cfp-sync` the role `roles/aiplatform.user`.
   - **Check:** the CFP's personal-data consent must cover AI-assisted review, with processing in the EU. The current form's wording "to review your submission" was judged to cover it. Consider adding an AI-transparency line to next year's form.
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

## AI assist

Three features help reviewers get through the talks faster:

- **Overview.** A short, foldable summary above the talk title in meeting mode. Admins can press **Regenerate** to redo one talk.
- **Similar talks.** A panel in the talk column that lists related talks.
- **Topic map.** The **Topic map** page (`/map`) draws every talk as a dot, grouped into clusters by topic. Click a dot to open the talk.

The overview is based only on what the speaker wrote, and AI never decides anything. Scores, comments and Approve / Maybe / Decline stay with the team.

**Privacy.** The AI runs on Vertex AI in `europe-west1`, inside the same Google Cloud project. Only the talk text and the speaker's bio, experience, company and job title are sent (plus country, city, session type and participation for Advocu applications). Names, emails, phones, links, photos, logistics and consent are never sent.

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
