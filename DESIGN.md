---
name: DevFest Istanbul Speakers
description: The organizing team's CFP review dashboard, where Google's four colours are the four review statuses.
colors:
  ground: "#f1f3f4"
  surface: "#ffffff"
  raised: "#f8f9fa"
  active: "#dfe2e6"
  border: "#dadce0"
  rule: "#eceef0"
  control: "#c4c7cb"
  text: "#202124"
  muted: "#5f6368"
  faint: "#6b6f74"
  primary: "#202124"
  primary-hover: "#3c4043"
  pending: "#1a73e8"
  pending-bg: "#e8f0fe"
  pending-ink: "#174ea6"
  maybe: "#f9ab00"
  maybe-bg: "#fef7e0"
  maybe-ink: "#7a4300"
  approved: "#1e8e3e"
  approved-bg: "#e6f4ea"
  approved-ink: "#0d652d"
  declined: "#d93025"
  declined-bg: "#fce8e6"
  declined-ink: "#a50e0e"
  projector-muted: "#3c4043"
  projector-faint: "#4d5156"
  projector-control: "#9aa0a6"
typography:
  headline:
    fontFamily: "Google Sans Flex, Google Sans, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: "32px"
    letterSpacing: "-0.005em"
    fontFeature: "tnum"
  headline-object:
    fontFamily: "Google Sans Flex, Google Sans, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: "28px"
  title:
    fontFamily: "Google Sans Flex, Google Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "24px"
  reading:
    fontFamily: "Google Sans Flex, Google Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "26px"
  row-title:
    fontFamily: "Google Sans Flex, Google Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "20px"
  body:
    fontFamily: "Google Sans Flex, Google Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "tnum"
  subhead:
    fontFamily: "Google Sans Flex, Google Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  secondary:
    fontFamily: "Google Sans Flex, Google Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  label:
    fontFamily: "Google Sans Flex, Google Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  figure:
    fontFamily: "Google Sans Flex, Google Sans, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: "30px"
    fontFeature: "tnum"
rounded:
  card: "20px"
  inner: "12px"
  chip: "8px"
  tag: "6px"
  pill: "18px"
  full: "50%"
spacing:
  hair: "2px"
  xs: "8px"
  sm: "12px"
  gap: "16px"
  card-pad: "24px"
  pad: "32px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  button-hover:
    backgroundColor: "{colors.raised}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-small:
    rounded: "16px"
    padding: "0 12px"
    height: "32px"
  status-pending:
    backgroundColor: "{colors.pending-bg}"
    textColor: "{colors.pending-ink}"
    rounded: "{rounded.inner}"
    padding: "0 10px 0 8px"
    height: "24px"
  status-maybe:
    backgroundColor: "{colors.maybe-bg}"
    textColor: "{colors.maybe-ink}"
    rounded: "{rounded.inner}"
    padding: "0 10px 0 8px"
    height: "24px"
  status-approved:
    backgroundColor: "{colors.approved-bg}"
    textColor: "{colors.approved-ink}"
    rounded: "{rounded.inner}"
    padding: "0 10px 0 8px"
    height: "24px"
  status-declined:
    backgroundColor: "{colors.declined-bg}"
    textColor: "{colors.declined-ink}"
    rounded: "{rounded.inner}"
    padding: "0 10px 0 8px"
    height: "24px"
  tag:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.muted}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
    height: "22px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  count-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.figure}"
    rounded: "{rounded.inner}"
    padding: "12px 16px"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "0 16px 0 40px"
    height: "36px"
    width: "320px"
  select:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.chip}"
    padding: "0 34px 0 12px"
    height: "36px"
  textarea:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.inner}"
    padding: "10px 12px"
  segmented-selected-score:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    height: "34px"
  nav-item:
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  nav-item-current:
    backgroundColor: "{colors.active}"
    textColor: "{colors.text}"
---

# Design System: DevFest Istanbul Speakers

## Overview

**Creative North Star: "The Four Colours as Signal"**

The community's own identity system put to work. Google's four colours (blue, yellow, green, red) are not decoration here; they are the four review statuses, Pending, Maybe, Approved and Declined, and they mean nothing else. Everything around them is a quiet Google-grey workspace: white cards resting on a pale grey ground, near-black text and actions, hairline rules. Because the chrome is colourless, a single green dot reads instantly as "approved".

Density is that of a working tool used for hours on a laptop: 14px body on a 20px line, 36px controls, tables with 11px cell padding, tabular figures everywhere. Depth comes from tone (white on grey), never from shadow, with one exception: the compact talk bar that floats over scrolled content. The same screens enlarge for a meeting room through a projector view rather than a separate design.

The system rejects the grey admin panel with one blue accent: blue is a status here, so it can never be the brand colour, the link colour or the focus colour.

**Key Characteristics:**
- Four status hues, each with a pale pill background and a dark ink of the same hue.
- Near-black (#202124) for primary actions, links, focus rings, selected score and switches.
- White surfaces on a #f1f3f4 ground; radii step 20 / 12 / 8 / 6px.
- Flat at rest; one soft shadow on the floating compact bar only.
- Google Sans Flex throughout, tabular figures by default.
- A projector view that zooms the same layout and hides private data.

## Colors

A colourless Google-grey workspace in which the four Google hues are reserved, as full-strength marks and pale tonal pairs, for the four review statuses.

### Primary
- **Ink Black** (#202124): primary buttons, the selected score segment, a checked switch, the focus outline, link underlines and the similarity bar fill. It doubles as body text, so the action colour never competes with a status hue. Hover deepens to Charcoal (#3c4043).

### Status (the four Google colours)
Each status is a triad: the full hue for small marks, a pale background and a dark ink for pills and selected states.
- **Pending Blue** (#1a73e8, pale #e8f0fe, ink #174ea6): the default state of every submission.
- **Maybe Yellow** (#f9ab00, pale #fef7e0, ink #7a4300).
- **Approved Green** (#1e8e3e, pale #e6f4ea, ink #0d652d).
- **Declined Red** (#d93025, pale #fce8e6, ink #a50e0e).

### Neutral
- **Ground Grey** (#f1f3f4): page background, the top bar and the open mobile drawer.
- **Surface White** (#ffffff): cards, inputs, buttons, count cards.
- **Raised Grey** (#f8f9fa): row hover, button hover, tags, topic-map cluster fills, bar tracks.
- **Active Grey** (#dfe2e6): the current nav item.
- **Border Grey** (#dadce0): table header rule, count-card hover outline, settings dividers, keycaps.
- **Rule Grey** (#eceef0): hairlines between rows, list items and summary cells.
- **Control Grey** (#c4c7cb): input, button and segmented-control strokes; unchecked switch track; scrollbar thumb.
- **Muted Grey** (#5f6368): secondary text, labels, table headers, icons.
- **Faint Grey** (#6b6f74): placeholders, dashes for empty cells, disabled and removed rows.

### Named Rules
**The Four Colours Rule.** Blue, yellow, green and red mean Pending, Maybe, Approved and Declined and nothing else. The only non-status use is two system tones built from the pale pairs: errors take Declined ink (#a50e0e) on its pale (#fce8e6), and the refresh notice takes Maybe ink on its pale. The full-strength hues never appear outside a status.

**The Small Marks Rule.** Full-strength hues appear only on small marks: the 8px status dot, the proportion strip, topic-map dots, the selected decision's outline and the four-dot product mark. Larger areas take the pale background with the dark ink.

**The Black Action Rule.** Every primary action, link, focus ring and selected non-status control is Ink Black. No accent colour exists apart from the statuses.

## Typography

**Display Font:** none (no separate display face)
**Body Font:** Google Sans Flex (with Google Sans, system-ui, sans-serif), loaded from Google Fonts with the full optical-size and weight axes and `font-optical-sizing: auto`.

**Character:** One family for everything, the event's own typeface, set at modest sizes with 500 as the emphasis weight. Hierarchy comes from size steps of 2px and weight, not from a contrasting face.

### Hierarchy
- **Headline** (500, 24px / 32px, -0.005em): page titles (Submissions, Logistics, Team).
- **Headline object** (500, 22px / 28px): the talk title in the talk header; 22px / 28px also sets summary and tally figures.
- **Title** (500, 16px / 24px): card headings and the compact bar title. The speaker name in its card takes 18px / 24px.
- **Reading** (400, 16px / 26px, max 68ch, pre-line): talk abstracts and speaker bios.
- **Row title** (500, 15px / 20px): the talk title in a table row.
- **Body** (400, 14px / 20px): everything else; subheads use 600 at the same size.
- **Secondary** (400, 13px / 18px): row sublines, stamps, notes, footers.
- **Label** (400, 12px / 16px): table headers, control labels, tags, status pills (600). Sentence case, never uppercase.
- **Figure** (500, 24px / 30px): count-card values.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on the body, so every count, score and date lines up in columns.

**The One Date Rule.** Timestamps read "17 Nov 2026, 10:21" (en-GB, day, short month, year, 24-hour time); dates without a time read "17 Nov 2026". Comment ages use relative time.

## Layout

A 240px sticky left sidebar plus a fluid canvas with 32px side padding (28px top, 48px bottom). At 1440px wide that leaves a 1136px content width. The talk page splits into a 4fr main column and 2fr side column with a 16px gap (752px and 368px at 1440); the topic map uses a fluid map plus a 320px list; settings pages (Team, Import) use a 360px description column beside the content, capped at 1136px, separated by 32px bands.

Rhythm is 4px-based: 8px between controls, 12px inside rows, 16px between cards, 24px inside cards and between sections, 32px between settings bands.

Responsive behaviour:
- **≤1279px:** the talk header's verdict drops under the title; the logistics summary goes from six cells to three.
- **≤1023px (tablet):** the sidebar becomes a 56px sticky top bar with a menu button and full-screen drawer; canvas padding 16px 24px 40px; talk, map and settings layouts become one column; labelled tables become key-value rows; the compact bar docks under the top bar.
- **≤720px (phone):** canvas padding 12px 16px 32px; count cards become a horizontally scrolling row of pills; tables become two-line rows (status above, talk and speaker left, score right); the talk header stacks and segmented controls go full width with 44px targets; the compact bar is removed.

**Projector view** (`html.projector`, toggled with P on the talk page): the same screen, not a different one. The sidebar, top bar and key hints disappear, the canvas zooms 1.35 (1.6 at ≥1800px wide), secondary greys darken (muted #3c4043, faint #4d5156, control #9aa0a6) for washed-out projectors, and speaker contact details, the comment composer and comment actions are hidden because the whole room sees the screen.

## Elevation & Depth

Flat and tonal. Depth is white surface on grey ground; separation inside a card is a 1px rule. Nothing has a shadow at rest.

### Shadow Vocabulary
- **Floating bar** (`box-shadow: 0 8px 16px -12px rgba(32, 33, 36, 0.28)`): only the compact talk bar, which floats over scrolled content. It fades and slides 6px in over 150ms ease-out.

### Named Rules
**The Flat Rule.** Surfaces are flat. A shadow is allowed only on something that floats over scrolling content, and today that is the compact bar alone.

## Shapes

Soft, nested rounding that steps down as elements nest: cards 20px, inner panels, count cards, text areas, notices and drop zones 12px, selects 8px, tags 6px. Interactive controls are full pills (height / 2: 18px for 36px controls, 16px for small buttons, 22px for the sign-in button, 12px for status pills). Avatars and dots are circles; portraits are 52 by 64px at 10px radius. Borders are 1px (1.5px for selected count cards and the dashed drop zone). Bars and the strip are 6px or 4px tall with half-height radius.

## Components

### Buttons
Quiet pills; only the primary is dark.
- **Shape:** full pill (18px radius at 36px height).
- **Default:** white with a Control Grey 1px stroke, 500 weight, 0 16px padding; hover Raised Grey, active Rule Grey.
- **Primary:** Ink Black fill and stroke, white text; hover Charcoal.
- **Text:** no stroke or fill, 0 10px padding; hover a 6% black wash.
- **Small:** 32px high, 0 12px, 13px text.
- **Icon button:** 36px circle, muted icon, 6% wash on hover.
- **Focus:** 2px Ink Black outline, 2px offset, on every focusable element.
- **Disabled:** Faint Grey text on white.

### Status pills and tags
- **Status pill:** 24px high, 12px radius, pale status background, status ink, 12px 600, led by an 8px dot of the full hue. One way to show a status, everywhere.
- **Tag:** 22px high, 6px radius, Raised Grey with a Rule Grey hairline, muted 12px text. One way to show a tag (topic, level, counts like "3 waiting").

### Cards / Containers
- **Corner Style:** 20px.
- **Background:** Surface White on Ground Grey.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** none; internal divisions are Rule Grey hairlines.
- **Internal Padding:** 24px; table cards clip to the radius with 16px cell padding.

### Inputs / Fields
- **Search:** 36px pill, white, Control Grey stroke, 14px search icon inset at 14px, Faint placeholder, 320px wide (full width on phone).
- **Select:** 36px, 8px radius, a drawn chevron, max 220px.
- **Text area:** 12px radius, 10px 12px padding, 72px minimum.
- **Switch:** 34 by 20px track, Control Grey off, Ink Black on, 150ms slide.
- **Focus:** the global 2px Ink Black outline.
- **Error:** Declined ink at 13px / 18px; page-level errors in a 12px-radius banner on the Declined pale.

### Navigation
- **Sidebar:** the four-dot mark (2 by 2 grid of 8px dots in blue, red, yellow, green) above "DevFest Istanbul / Speakers 2026"; labelled items 36px high as pills with a 16px line icon; muted at rest, 5% wash on hover, Active Grey fill with text colour and 500 weight when current; small muted group labels; the signed-in user with avatar and sign-out at the foot.
- **Tablet and phone:** a 56px Ground Grey top bar with the mark and a menu button opening the full-height drawer.

### Status filter (signature)
Five count cards (All plus the four statuses) in a five-column grid with 8px gaps, each a white 12px-radius button with a dot and muted label over a 24px figure. Hover shows a Border Grey 1.5px outline; the pressed card takes its status hue as outline, its pale as fill and its ink as label (All uses Ink Black). Beneath sits a 6px proportion strip of the four hues, each segment's width equal to its count, separated by 2px gaps. The same pair filters the list and highlights the topic map. On phones the cards become scrolling pills.

### Talk header and compact bar (signature)
A white card holding the speaker portrait, the 22px talk title with a meta line, and the verdict: a segmented score control (1 to 5, the selected segment Ink Black) and, for admins, a segmented decision control whose selected segment takes the status pale, ink and a 1.5px inset outline of the hue. Scoring and deciding happen here without scrolling. Above it sits a zero-height sticky anchor; once the header scrolls past, a compact bar (title, score, decision) fades in from it at 12px from the top, so showing it never shifts the layout below.

### Tables
40px header row of 12px muted labels over a Border Grey rule, sortable headers turn to text colour when sorted; rows with Rule Grey hairlines, Raised Grey hover and a 15px / 500 title that underlines on hover; numbers right-aligned; a muted 13px footer.

## Do's and Don'ts

### Do:
- **Do** reserve #1a73e8, #f9ab00, #1e8e3e and #d93025 for Pending, Maybe, Approved and Declined, and show a status only as the dot-led pale pill, a dot, or a strip segment.
- **Do** use Ink Black (#202124) for primary actions, links, focus and any selected control that is not a status.
- **Do** keep surfaces flat: white (#ffffff) cards on #f1f3f4 with 20 / 12 / 8 / 6px radii.
- **Do** keep tabular figures on and write dates as "17 Nov 2026, 10:21".
- **Do** check every new screen in projector view: nothing private visible, everything legible at 1.35x zoom.
- **Do** draw icons as 16px stroked inline SVG in currentColor, muted by default.

### Don't:
- **Don't** use any of the four hues as a brand accent, link colour, chart colour or decoration.
- **Don't** fill large areas with a full-strength status hue; use the pale and the ink.
- **Don't** add shadows to cards, buttons or menus at rest; the compact bar's floating shadow is the only one.
- **Don't** introduce a second typeface or uppercase letter-spaced labels.
- **Don't** add a second way to show a status or a tag.
