import { describe, expect, it } from 'vitest'
import { emailHtmlToText } from '../src/email/htmlText.js'

describe('emailHtmlToText', () => {
  it('separates blocks with a blank line and keeps <br> as a line break', () => {
    expect(emailHtmlToText('<p>Hi Ada,</p><h2>Next steps</h2><p>One<br>Two</p>')).toBe('Hi Ada,\n\nNext steps\n\nOne\nTwo')
  })

  it('writes the address after a link whose text differs', () => {
    const html = '<p>See <a href="https://cfp.test/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">the <b>schedule</b></a>.</p>'
    expect(emailHtmlToText(html)).toBe('See the schedule (https://cfp.test/a?x=1&y=2).')
  })

  it('does not repeat an address that is already the link text', () => {
    expect(emailHtmlToText('<p><a href="https://cfp.test">https://cfp.test</a></p>')).toBe('https://cfp.test')
    expect(emailHtmlToText('<p><a href="mailto:team@cfp.test">team@cfp.test</a></p>')).toBe('team@cfp.test')
    expect(emailHtmlToText('<p><a href="mailto:team@cfp.test">Write to us</a></p>')).toBe('Write to us (team@cfp.test)')
  })

  it('marks bulleted and numbered items, one per line', () => {
    const html = '<p>Bring:</p><ul><li><p>Laptop</p></li><li><p>Adapter</p></li></ul><ol><li><p>Arrive</p></li><li><p>Talk</p></li></ol><p>Thanks</p>'
    expect(emailHtmlToText(html)).toBe('Bring:\n\n• Laptop\n• Adapter\n\n1. Arrive\n2. Talk\n\nThanks')
  })

  it('indents nested lists', () => {
    expect(emailHtmlToText('<ul><li><p>A</p><ol><li><p>B</p></li></ol></li><li><p>C</p></li></ul>')).toBe('• A\n  1. B\n• C')
  })

  it('decodes entities, drops images and keeps the signature after a line break', () => {
    const html = '<p>Ada &lt;b&gt; &amp; co&nbsp;here</p><br><p>The team</p><p><img src="https://x.test/l.png" alt="logo"></p>'
    expect(emailHtmlToText(html)).toBe('Ada <b> & co here\n\nThe team')
  })

  it('collapses source whitespace', () => {
    expect(emailHtmlToText('<p>\n  Hello\n  there  </p>\n<p> again</p>')).toBe('Hello there\n\nagain')
  })

  it('tableCellsOnTheirOwnLines', () => {
    expect(emailHtmlToText('<p>Hi</p><br><table><tr><td><b>DevFest Team</b></td><td><span>GDG Cloud</span></td></tr></table>'))
      .toBe('Hi\n\nDevFest Team\nGDG Cloud')
  })
})
