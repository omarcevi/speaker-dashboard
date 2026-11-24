# HTML Emails and Team Signature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Templates, custom emails and one team signature are written in a rich-text editor and sent as HTML, and the dashboard previews exactly the HTML that is sent.

**Architecture:** One shared module (`functions/src/shared/emailHtml.ts`, importable by the web) cleans HTML with an allow-list and renders a template's HTML with escaped fill-ins plus the signature. The server sends that HTML with a plain-text part derived from it, and stores it on the email doc. The web uses TipTap for editing and a sandboxed iframe for every preview of email HTML.

**Tech Stack:** Firebase Functions v2 (Node 22), Firestore, Storage, React 19 + Vite + TS, Vitest, `xss` (js-xss, shared sanitizer), TipTap v3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-image`).

**Spec:** `docs/superpowers/specs/2026-11-24-html-email-design.md`

## Global Constraints

- Web code may import from `functions/src` only `model.ts`, `talkKey.ts`, `shared/*` and `email/fillIns.ts`. The new shared module lives in `functions/src/shared/`.
- `xss` is a dependency of `functions/` (the web resolves it through the shared file). TipTap packages are dependencies of `web/`. Pin the versions npm resolves today, with a caret.
- Allowed tags after cleaning: `p br strong b em i u s h1 h2 h3 ul ol li a img blockquote hr span div`. Allowed attributes: `a[href]`, `img[src alt width height]`. `href` and `src` must start with `https://`, `http://` or `mailto:` (`mailto:` for `a` only). Everything else is removed, including `style`, `class`, event handlers, `<script>` and its contents.
- Links get `target="_blank" rel="noopener noreferrer"` when cleaned.
- Fill-in values are HTML-escaped (`& < > " '`). Newlines in a value become `<br>`, so `{{talkTitles}}` keeps one bullet line per talk.
- The signature is appended as `<br>` + the cleaned `signatureHtml`, after the body, only when `signatureHtml` is non-empty after cleaning.
- Old templates without `html` keep working: their HTML is `textToHtml(body)` (today's `toHtml`).
- Images upload to Storage `emailImages/{uuid}-{safeFileName}`: admins write (image/*, under 5 MB), nobody reads through rules; emails link the Firebase download URL.
- Every preview of email HTML in the web is an `<iframe sandbox="" srcDoc=...>` (no scripts, no same-origin). Never `dangerouslySetInnerHTML`.
- Copy: the signature editor is titled "Team signature", hint "Added to the end of every email, replies included."
- No Claude co-author trailer in commits.

## Review Focus

1. A speaker name or talk title containing `<`, `&` or `"` must arrive as text, not markup (Task 1 test `escapesFillIns`).
2. Pasted HTML from Gmail (styles, classes, `<font>`, tracking pixels with `http:` src) must not break the email; unknown tags are unwrapped, their text kept (Task 1 test `unwrapsUnknownTags`).
3. A fill-in split by formatting (`{{<b>firstName</b>}}`) is malformed and blocks sending, as today (Task 1 test `splitFillInIsMalformed`).
4. A scheduled email written before this change (no `html` anywhere) still sends (Task 2 test `legacyTemplateSendsAsHtml`).
5. An empty signature (`<p></p>`) adds nothing (Task 1 test `emptySignatureAddsNothing`).

---

### Task 1: Shared HTML rendering and cleaning

**Files:**
- Create: `functions/src/shared/emailHtml.ts`
- Test: `functions/test/emailHtml.test.ts`
- Modify: `functions/package.json` (add `xss`)

**Interfaces:**
- Consumes: `fillInParts`, `fillInsIn`, `toHtml` from `functions/src/email/fillIns.ts`.
- Produces:
  - `cleanEmailHtml(html: string): string`
  - `isBlankHtml(html: string): boolean`: true when the cleaned HTML has no text and no `<img>`.
  - `templateHtml(t: { body: string; html?: string | null }): string`: `t.html` if it is a non-blank string, else `toHtml(t.body)`.
  - `renderHtmlEmail(t: { subject: string; html: string }, values: Record<string, string>, signatureHtml: string): { ok: true; subject: string; html: string } | { ok: false; missing: string[]; empty: string[] }`. Uses the same missing/empty rules as `renderEmail`; the subject's fill-ins are plain text (not escaped); the body's are escaped; the result is cleaned.

- [ ] **Step 1: Write the failing tests** in `functions/test/emailHtml.test.ts`:
  - `escapesFillIns`: `renderHtmlEmail({subject:'Hi {{firstName}}', html:'<p>Dear {{firstName}}</p>'}, {firstName:'Ada <b>&'}, '')` gives `subject === 'Hi Ada <b>&'` and `html === '<p>Dear Ada &lt;b&gt;&amp;</p>'`.
  - `talkTitlesKeepLines`: value `'• One\n• Two'` renders `• One<br>• Two`.
  - `appendsSignature`: signature `'<p>Team</p><p><img src="https://x.test/l.png" alt="logo"></p>'` gives html ending `<br><p>Team</p><p><img src="https://x.test/l.png" alt="logo" /></p>` (match js-xss's actual self-closing output; assert with `toContain` on `alt="logo"` and `endsWith('</p>')` if exact form differs).
  - `emptySignatureAddsNothing`: signature `'<p></p>'` leaves html equal to the body render.
  - `stripsScriptsAndHandlers`: `cleanEmailHtml('<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">b</a><img src="data:x">')` contains `a`, contains `b`, and contains none of `onclick`, `script`, `alert`, `javascript:`, `data:`.
  - `unwrapsUnknownTags`: `cleanEmailHtml('<font color="red">Hi</font><div class="x" style="color:red">there</div>')` equals `'Hi<div>there</div>'`.
  - `linksOpenInNewTab`: `cleanEmailHtml('<a href="https://a.test">x</a>')` equals `'<a href="https://a.test" target="_blank" rel="noopener noreferrer">x</a>'`.
  - `splitFillInIsMalformed`: `renderHtmlEmail({subject:'s', html:'<p>{{<b>firstName</b>}}</p>'}, {firstName:'Ada'}, '')` is `ok: false` or leaves no `{{`-free result; assert `fillInsIn` on that html reports it the same way `renderEmail` does for `'{{<b>firstName</b>}}'` (malformed → blocked by the existing malformed check).
  - `templateHtmlFallsBack`: `templateHtml({body:'a\n\nb'})` equals `'<p>a</p><p>b</p>'`; `templateHtml({body:'x', html:'<p></p>'})` equals `'<p>x</p>'`.
  - `missingFillIn`: `renderHtmlEmail({subject:'s', html:'<p>{{venue}}</p>'}, {}, '')` is `{ ok: false, missing: ['venue'], empty: [] }`.
- [ ] **Step 2:** Run `npx vitest run test/emailHtml.test.ts` in `functions/`. Expected: FAIL (module not found).
- [ ] **Step 3:** `npm i xss --prefix functions`, then implement `functions/src/shared/emailHtml.ts` with a header comment (shared with the web; server-safe and browser-safe; no Node imports). Use `new FilterXSS({ whiteList, stripIgnoreTag: true, stripIgnoreTagBody: ['script', 'style'], onTagAttr, safeAttrValue })` with the allow-list from Global Constraints; add `target`/`rel` to `a` in `onTag`.
- [ ] **Step 4:** Run the test. Expected: PASS. Run `npx tsc --noEmit -p functions` and `npm test --prefix functions`. Expected: clean, all pass.
- [ ] **Step 5:** Commit `feat(email): shared HTML cleaning and rendering with escaped fill-ins and signature`.

### Task 2: Server sends and stores HTML

**Files:**
- Modify: `functions/src/model.ts` (`EmailTemplate.html?: string | null`; `EventSettings.signatureHtml?: string`; `EmailDoc.html: string | null`; `request.custom` becomes `{ subject: string; body: string; html?: string | null }`)
- Modify: `functions/src/email/loadSpeakers.ts` (expose `signatureHtml: string` from `meta/event`, default `''`)
- Modify: `functions/src/email/compose.ts`, `functions/src/email/queue.ts`, `functions/src/email/importSent.ts` (`html: null`), `functions/src/email/seedTemplates.ts` (seed `html` for both templates, equal to `toHtml(body)`), `functions/src/index.ts` (callable input validation accepts `custom.html`)
- Test: `functions/test/queue.emulator.test.ts`, `functions/test/seedTemplates.emulator.test.ts`

**Interfaces:**
- Consumes: Task 1 `templateHtml`, `renderHtmlEmail`, `cleanEmailHtml`; `htmlToText` from `email/parseMessage.ts`.
- Produces:
  - `compose(...)` success result gains `html: string | null` (null when `render` is false). The rendered `text` becomes `htmlToText(html)`.
  - A reply (`subjectOverride` set) is a custom email whose `html` is `toHtml(body)` when `custom.html` is absent; it gets the signature like any email.
  - `prepare` in `queue.ts` sends `html: e.html ?? toHtml(e.text)` (legacy docs) and `text: e.text`.
  - `EmailDoc.html` is written by `enqueue` (send now), `writeScheduled` (at send time), `sendTestEmail` (not stored) and is `null` for manual and imported emails.

- [ ] **Step 1: Write the failing tests** in `queue.emulator.test.ts`:
  - `sendsTemplateHtmlWithSignature`: template with `html: '<p>Hi <b>{{firstName}}</b></p>'`, `meta/event` with `signatureHtml: '<p>Team</p>'`, speaker first name `'Ada & Co'`; after send-now and one run, the raw MIME's HTML part contains `<p>Hi <b>Ada &amp; Co</b></p><br><p>Team</p>`, the text part contains `Hi Ada & Co` and `Team`, and the email doc's `html` equals the sent HTML.
  - `legacyTemplateSendsAsHtml`: template without `html` (body `'Line one\n\nLine two'`) sends an HTML part containing `<p>Line one</p><p>Line two</p>`.
  - `scheduledRendersHtmlAtSendTime`: a scheduled email whose template `html` changes before it is due sends the new HTML.
  - `replyGetsSignature`: a reply (custom body `'Thanks!'`, `replyToThreadId` set) sends HTML containing `<p>Thanks!</p>` followed by the signature.
  - `customHtmlIsCleaned`: custom `{ subject: 'S', body: 'x', html: '<p>Hi</p><script>bad()</script>' }` sends HTML without `script`.
  - In `seedTemplates.emulator.test.ts`, assert the seeded templates have `html` equal to `toHtml(body)`.
- [ ] **Step 2:** Run the emulator suite (`npm run test:emulator --prefix functions`, Java 21 on PATH). Expected: the new tests FAIL.
- [ ] **Step 3:** Implement per the Interfaces block. Keep the subject plain text. Malformed fill-ins in `html` block exactly as they do in `body` today (compose already checks the source; check the HTML source instead of the body when `html` is present).
- [ ] **Step 4:** Run unit + emulator suites and `tsc`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(email): send and store HTML with the team signature`.

### Task 3: Storage rules for email images

**Files:**
- Modify: `storage.rules`
- Test: `tests/rules/storage.test.ts` (or the existing storage rules test file)

**Interfaces:**
- Produces: path `emailImages/{file}`; admins may create when `request.resource.contentType.matches('image/.*')` and `request.resource.size < 5 * 1024 * 1024`; admins may delete; nobody reads through rules (emails use the download URL's token).

- [ ] **Step 1:** Tests: admin uploads a 1 KB `image/png` → allowed; admin uploads `text/html` → denied; admin uploads 6 MB png → denied; member uploads png → denied; member and admin `getBytes` → denied.
- [ ] **Step 2:** Run `npm test` at the repo root (rules suite). Expected: new tests FAIL.
- [ ] **Step 3:** Add the `match /emailImages/{file}` block.
- [ ] **Step 4:** Run the rules suite. Expected: PASS.
- [ ] **Step 5:** Commit `feat(rules): admins upload email images`.

### Task 4: Rich-text editor and sandboxed preview components

**Files:**
- Create: `web/src/components/RichEditor.tsx`, `web/src/components/EmailFrame.tsx`, `web/src/lib/emailImages.ts`
- Test: `web/src/lib/emailImages.test.ts`
- Modify: `web/package.json`, `web/src/styles.css`

**Interfaces:**
- Consumes: Task 1 `cleanEmailHtml`; `safeFileName` from `web/src/lib/emails.ts`; Firebase Storage from `web/src/firebase.ts` (or wherever the app's storage instance lives).
- Produces:
  - `<RichEditor value={html} onChange={(html: string) => void} fillIns={{ name: string; label: string }[]} ariaLabel={string} />`: TipTap StarterKit (bold, italic, headings 1–3, bullet and ordered lists, blockquote, link) + Image. Toolbar buttons: Bold, Italic, Heading, Bulleted list, Numbered list, Link (asks for a URL in an inline field, not `window.prompt`), Image (file picker → upload → insert), Insert fill-in (menu listing `fillIns`, inserts `{{name}}` as text). Pasted content goes through `cleanEmailHtml` before insertion.
  - `<EmailFrame html={string} title={string} />`: `<iframe sandbox="" srcDoc={...} title={title}>` with a minimal base style (system font, 14px, max-width 640px, images `max-width:100%`) and height that fits content (measure on load is impossible with `sandbox=""`; use a fixed min-height 320px and `resize: vertical`).
  - `emailImagePath(fileName: string, uuid: string): string` → `emailImages/${uuid}-${safeFileName(fileName)}`; `uploadEmailImage(file: File): Promise<string>` returns the download URL; refuses non-images and files of 5 MB or more with an `Error` whose message is user copy (`'Images only'`, `'Images must be under 5 MB'`).

- [ ] **Step 1:** Tests for `emailImagePath` (Turkish and spaced names stay readable and safe, as `safeFileName` does) and for the size/type checks (export them as `imageProblem(file: { type: string; size: number }): string | null`).
- [ ] **Step 2:** Run `npm test --prefix web -- --run src/lib/emailImages.test.ts`. Expected: FAIL.
- [ ] **Step 3:** `npm i @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-image --prefix web`; implement the three files. Style the toolbar with existing tokens in `styles.css` (no new colours; buttons 32px high, `aria-pressed` for active marks).
- [ ] **Step 4:** Run web tests, `npx tsc -b` in `web/`, and `npm run build --prefix web`. Expected: pass, build ok.
- [ ] **Step 5:** Commit `feat(web): rich-text email editor and sandboxed email preview`.

### Task 5: Use HTML across the email pages

**Files:**
- Modify: `web/src/pages/TemplateEditPage.tsx`, `web/src/pages/EventSettingsPage.tsx`, `web/src/pages/SendPage.tsx`, `web/src/lib/send.ts`, `web/src/data/mailActions.ts`, `web/src/components/EmailHistory.tsx`, `web/src/components/Conversation.tsx`, `web/src/data/DataProvider.tsx` (expose `signatureHtml`)
- Test: `web/src/lib/send.test.ts`

**Interfaces:**
- Consumes: Task 1 `renderHtmlEmail`, `templateHtml`, `isBlankHtml`; Task 4 `RichEditor`, `EmailFrame`; `EmailDoc.html` from Task 2.
- Produces:
  - Template editor: the body field becomes `RichEditor`; saving writes `html` and also `body` = the editor's plain text (`editor.getText()` with blank lines between blocks) so lists and snippets keep working. The preview pane renders `renderHtmlEmail(..., signatureHtml)` in `EmailFrame`; the fill-in warnings stay as they are, computed from the HTML.
  - Event settings: a "Team signature" section with `RichEditor` and hint "Added to the end of every email, replies included."; saved as `meta/event.signatureHtml`.
  - Send flow: the custom email body becomes `RichEditor`; `CustomEmail` gains `html`; the per-speaker preview uses `EmailFrame` with the signature.
  - `previewFor` (or the existing preview function in `lib/send.ts`) returns `html` from `renderHtmlEmail`.
  - Email history and conversation: a sent email with `html` shows in `EmailFrame`; without `html` it shows as today (`Text`).
  - The reply box stays plain text; its hint says the signature is added.

- [ ] **Step 1:** Tests in `send.test.ts`: the preview for a template with `html` and a signature returns html containing the escaped first name and the signature; a template without `html` previews from `body`.
- [ ] **Step 2:** Run the web tests. Expected: new tests FAIL.
- [ ] **Step 3:** Implement per the Interfaces block.
- [ ] **Step 4:** Run web tests, `tsc -b`, build, and `npm test` (rules) if `firestore.rules` changed (it should not: admins already write templates and `meta/event`).
- [ ] **Step 5:** Commit `feat(web): HTML templates, team signature and exact previews`.

### Task 6: Docs and seed data

**Files:**
- Modify: `README.md` (Email setup: the signature and images), `functions/scripts/seed-emulator.ts` (a sample `signatureHtml` with text only, and `html` on the seeded templates)

- [ ] **Step 1:** Update both; run the seed against a fresh emulator and check the Templates page shows formatted previews with the signature.
- [ ] **Step 2:** Commit `docs(email): HTML emails and the team signature`.
