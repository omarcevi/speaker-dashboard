// The plain-text part of an email we send, from its cleaned HTML (renderHtmlEmail's output). Unlike htmlToText,
// which reads replies, it keeps what a reader of the text part needs: link addresses and list markers. Server-only.
import { decodeEntities } from './parseMessage.js'

const BLOCKS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'blockquote', 'hr'])

/**
 * Text for an email's HTML: "text (url)" for a link whose text is not its address, "• " before bulleted items and
 * "1. " before numbered ones, a blank line between blocks.
 */
export function emailHtmlToText(html: string): string {
  let out = ''
  let pending = 0 // line breaks owed before the next text: 1 = new line, 2 = blank line
  let afterMarker = false // just wrote a list marker: the item's own <p> starts no new line
  const lists: { ordered: boolean; n: number }[] = []
  const links: { href: string; start: number }[] = []

  const write = (s: string) => {
    if (out && pending) out += '\n'.repeat(pending)
    pending = 0
    out += s
    afterMarker = false
  }
  const brk = (level: number) => {
    if (!afterMarker) pending = Math.max(pending, level)
  }

  for (const token of html.replace(/\s+/g, ' ').split(/(<[^>]*>)/)) {
    const tag = /^<(\/?)([a-z0-9]+)\b([^>]*)>$/i.exec(token)
    if (!tag) {
      const text = decodeEntities(token).replace(/ /g, ' ')
      // Collapsed HTML whitespace at the start of a line is layout, not text.
      const atLineStart = !out || pending > 0 || out.endsWith('\n')
      const shown = atLineStart && !afterMarker ? text.replace(/^ +/, '') : text
      if (shown) write(shown)
      continue
    }
    const [, close, rawName, attrs] = tag
    const name = rawName.toLowerCase()
    if (name === 'br') {
      write('\n')
    } else if (name === 'ul' || name === 'ol') {
      if (close) lists.pop()
      else lists.push({ ordered: name === 'ol', n: 0 })
      brk(lists.length ? 1 : 2)
    } else if (name === 'li') {
      if (close) continue
      brk(1)
      const list = lists.at(-1)
      const marker = list?.ordered ? `${++list.n}. ` : '• '
      write('  '.repeat(Math.max(lists.length - 1, 0)) + marker)
      afterMarker = true
    } else if (BLOCKS.has(name)) {
      brk(lists.length ? 1 : 2)
    } else if (name === 'a') {
      if (!close) {
        const href = /\shref="([^"]*)"/i.exec(attrs)?.[1]
        links.push({ href: href ? decodeEntities(href).trim() : '', start: out.length })
        continue
      }
      const link = links.pop()
      if (!link?.href) continue
      const text = out.slice(link.start).replace(/\s+/g, ' ').trim()
      const bare = link.href.replace(/^mailto:/i, '')
      if (text !== link.href && text !== bare) write(text ? ` (${bare})` : bare)
    }
  }
  return out.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
