# HTML emails and a team signature

**Why:** the team's emails carry an image signature and real formatting (headings, bold, lists, links). The dashboard
must send that, and its preview must show exactly what the speaker will read.

**Owner decisions (2026-11-24):** a rich-text editor for templates; one team signature for every email.

## Approaches considered

- **Rich-text editor (chosen).** Edit formatted text directly; the dashboard stores HTML.
- **Paste HTML.** Full control, but hard to edit and easy to break. Rejected by the owner.
- **Markdown.** Easy to store, but there are no images in a signature without HTML, and the team doesn't write Markdown.

## Design

- **Editor:** TipTap (ProseMirror) in the template editor, Event settings (signature) and custom emails. Bold, italic,
  headings, bullet and numbered lists, links, images, and a fill-in picker that inserts `{{name}}` as text.
- **Storage:** templates get `html`. Old plain-text templates keep working: if `html` is missing, the body is
  converted the same way as today. `meta/event` gets `signatureHtml`.
- **Images:** uploaded to Storage under `emailImages/`, admin-only write, linked by their Firebase download URL, so
  readers can load them without signing in. They are not embedded in the email.
- **Rendering (server, one function shared with the web preview):**
  1. Fill-ins are HTML-escaped, so a name with `<` or `&` can't break the HTML. `{{talkTitles}}` keeps one bullet line per talk (line breaks, valid inside a paragraph).
  2. The signature is added after the body. A reply written in the conversation sheet also gets the signature.
  3. The result is cleaned with an allow-list of tags and attributes, with no scripts, no event handlers and no
     `javascript:` links.
  4. A plain-text version is generated from the HTML for the text part of the email.
- **Preview:** a sandboxed iframe (no scripts) showing the exact HTML that will be sent, signature included.
- **Sent emails:** `emails/{id}` also stores the sent `html`, so the conversation view shows what was sent.

## Not in this change

- Embedding images inside the email (`cid:` images).
- Several signatures, or per-person signatures.
- Changing how replies from speakers are displayed (still text).

## Builder's calls

- The TipTap extensions and toolbar layout.
- The exact sanitizer allow-list.
- How the fill-in picker looks inside the editor.
