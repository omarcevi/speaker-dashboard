import { describe, it, expect } from 'vitest'
import { capMessage } from '../src/email/pollMail.js'

const base = {
  kind: 'reply' as const, from: 'ada@example.com', to: ['speakers@example.com'], cc: [], subject: 'Re: Hi', text: 'Hi',
  quoted: '', attachments: [],
}

describe('capMessage', () => {
  it('leaves a normal message alone', () => {
    expect(capMessage(base)).toEqual(base)
  })

  it('caps every field and marks it truncated', () => {
    const addrs = Array.from({ length: 150 }, (_, i) => `p${i}@example.com`)
    const atts = Array.from({ length: 60 }, (_, i) => ({ id: `a${i}`, name: `f${i}.pdf`, size: 1, mimeType: 'application/pdf' }))
    const c = capMessage({
      ...base, text: 'é'.repeat(200_001), quoted: 'q'.repeat(100_001), subject: 's'.repeat(1_001), to: addrs, cc: addrs, attachments: atts,
    })
    expect(c.truncated).toBe(true)
    expect([...c.text]).toHaveLength(200_000)
    expect(c.quoted).toHaveLength(100_000)
    expect(c.subject).toHaveLength(1_000)
    expect(c.to).toHaveLength(100)
    expect(c.cc).toHaveLength(100)
    expect(c.attachments).toHaveLength(50)
  })

  it('counts code points, not UTF-16 units', () => {
    const c = capMessage({ ...base, text: '😀'.repeat(150_000) })
    expect(c).not.toHaveProperty('truncated')
    expect(c.text).toBe('😀'.repeat(150_000))
  })

  it('keeps 4-byte bodies under the document size limit', () => {
    const c = capMessage({ ...base, text: '😀'.repeat(200_000), quoted: '😀'.repeat(100_000) })
    expect(c.truncated).toBe(true)
    expect(c.quoted).toBe('')
    expect(Buffer.byteLength(c.text)).toBeLessThanOrEqual(800_000)
  })
})
