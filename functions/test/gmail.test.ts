import { describe, expect, it, vi } from 'vitest'
import { fakeGmail, sharedFakeGmail } from '../src/testing/fakeGmail.js'
import { delegatedGmail } from '../src/email/gmail.js'

const b64u = (s: string) => Buffer.from(s).toString('base64url')
const raw = b64u('From: a@example.com\r\nTo: b@example.com\r\nSubject: Hi\r\nMessage-ID: <x@example.com>\r\n\r\nHello there')

describe('fakeGmail', () => {
  it('returns stable ids and a new thread unless threadId is given', async () => {
    const g = fakeGmail()
    const a = await g.send(raw)
    const b = await g.send(raw)
    const c = await g.send(raw, a.threadId)
    expect(a).toEqual({ id: 'fake-msg-1', threadId: 'fake-thread-1' })
    expect(b).toEqual({ id: 'fake-msg-2', threadId: 'fake-thread-2' })
    expect(c).toEqual({ id: 'fake-msg-3', threadId: 'fake-thread-1' })
    expect(g.sent).toHaveLength(3)
    expect(g.sent[2]).toEqual({ raw, threadId: 'fake-thread-1' })
  })

  it('getThread returns sent and added messages', async () => {
    const g = fakeGmail()
    const { threadId } = await g.send(raw)
    g.addReply(threadId, { id: 'r1', threadId, labelIds: ['INBOX'] })
    const msgs = await g.getThread(threadId)
    expect(msgs.map(m => m.id)).toEqual(['fake-msg-1', 'r1'])
    expect(msgs[0].labelIds).toEqual(['SENT'])
    const h = msgs[0].payload?.headers ?? []
    expect(h.find(x => x.name === 'Subject')?.value).toBe('Hi')
    expect(h.find(x => x.name === 'To')?.value).toBe('b@example.com')
    expect(Buffer.from(msgs[0].payload?.body?.data ?? '', 'base64url').toString()).toBe('Hello there')
    expect(await g.getThread('nope')).toEqual([])
  })

  it('failNext fails one send only', async () => {
    const g = fakeGmail()
    g.failNext(new Error('boom'))
    await expect(g.send(raw)).rejects.toThrow('boom')
    await expect(g.send(raw)).resolves.toBeTruthy()
    expect(g.sent).toHaveLength(1)
  })

  it('sharedFakeGmail is a singleton', () => {
    expect(sharedFakeGmail()).toBe(sharedFakeGmail())
  })
})

describe('delegatedGmail', () => {
  function setup(expiresIn = 3600) {
    const authRequest = vi.fn(async () => ({ data: { signedJwt: 'signed.jwt' } }))
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.startsWith('https://oauth2.googleapis.com/token'))
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: expiresIn }), { status: 200 })
      return new Response(JSON.stringify({ id: 'm1', threadId: 't1', messages: [{ id: 'm1' }] }), { status: 200 })
    })
    let t = 1_000_000
    const g = delegatedGmail(
      { serviceAccount: 'sa@p.iam.gserviceaccount.com', user: 'me@example.com' },
      { authRequest, fetch: fetchFn as unknown as typeof fetch, now: () => t },
    )
    return { g, authRequest, fetchFn, advance: (ms: number) => { t += ms } }
  }
  const tokenCalls = (f: ReturnType<typeof setup>['fetchFn']) =>
    f.mock.calls.filter(c => String(c[0]).startsWith('https://oauth2.googleapis.com/token'))

  it('exchanges once and caches the token across calls', async () => {
    const { g, authRequest, fetchFn } = setup()
    await g.send(raw)
    await g.getThread('t1')
    expect(tokenCalls(fetchFn)).toHaveLength(1)
    expect(authRequest).toHaveBeenCalledTimes(1)
    const req = authRequest.mock.calls[0][0] as { url: string; data: { payload: string } }
    expect(req.url).toBe('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/sa@p.iam.gserviceaccount.com:signJwt')
    const claims = JSON.parse(req.data.payload)
    expect(claims).toMatchObject({
      iss: 'sa@p.iam.gserviceaccount.com',
      sub: 'me@example.com',
      scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1000,
      exp: 4600,
    })
    const body = String(tokenCalls(fetchFn)[0][1]?.body)
    expect(body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer')
    expect(body).toContain('assertion=signed.jwt')
  })

  it('refreshes within 5 minutes of expiry', async () => {
    const { g, fetchFn, advance } = setup()
    await g.send(raw)
    advance(3600_000 - 299_000)
    await g.send(raw)
    expect(tokenCalls(fetchFn)).toHaveLength(2)
  })

  it('send passes threadId and bearer token', async () => {
    const { g, fetchFn } = setup()
    const r = await g.send(raw, 't9')
    expect(r).toEqual({ id: 'm1', threadId: 't1' })
    const call = fetchFn.mock.calls.find(c => String(c[0]).includes('/messages/send'))!
    expect(JSON.parse(String(call[1]?.body))).toEqual({ raw, threadId: 't9' })
    expect((call[1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  describe('label', () => {
    // A tiny Gmail labels API: `existing` labels, records creates and modifies.
    function labelled(existing: { id: string; name: string }[], opts: { failModify?: number } = {}) {
      const labels = [...existing]
      const creates: unknown[] = []
      const modifies: { path: string; body: unknown }[] = []
      let failModify = opts.failModify ?? 0
      const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url)
        if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }))
        if (u.endsWith('/labels') && init?.method === 'GET') return new Response(JSON.stringify({ labels }))
        if (u.endsWith('/labels')) {
          const b = JSON.parse(String(init?.body))
          creates.push(b)
          labels.push({ id: 'Label_new', name: b.name })
          return new Response(JSON.stringify({ id: 'Label_new', name: b.name }))
        }
        if (u.includes('/modify')) {
          if (failModify > 0) { failModify--; return new Response('{}', { status: 400 }) }
          modifies.push({ path: u, body: JSON.parse(String(init?.body)) })
          return new Response('{}')
        }
        return new Response('{}', { status: 404 })
      })
      const g = delegatedGmail(
        { serviceAccount: 's', user: 'x@example.com', label: 'Speaker Dashboard' },
        { authRequest: async () => ({ data: { signedJwt: 'j' } }), fetch: fetchFn as unknown as typeof fetch },
      )
      const listCalls = () => fetchFn.mock.calls.filter(c => String(c[0]).endsWith('/labels') && c[1]?.method === 'GET').length
      return { g, creates, modifies, listCalls }
    }

    it('creates the label once when missing, then adds it to each message', async () => {
      const { g, creates, modifies, listCalls } = labelled([{ id: 'INBOX', name: 'INBOX' }])
      await g.label('m1')
      await g.label('m2')
      expect(creates).toEqual([{ name: 'Speaker Dashboard', labelListVisibility: 'labelShow', messageListVisibility: 'show' }])
      expect(listCalls()).toBe(1)
      expect(modifies).toEqual([
        { path: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/m1/modify', body: { addLabelIds: ['Label_new'] } },
        { path: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/m2/modify', body: { addLabelIds: ['Label_new'] } },
      ])
    })

    it('reuses an existing label, matching the name case-insensitively', async () => {
      const { g, creates, modifies } = labelled([{ id: 'Label_7', name: 'speaker dashboard' }])
      await g.label('m1')
      expect(creates).toEqual([])
      expect(modifies[0].body).toEqual({ addLabelIds: ['Label_7'] })
    })

    it('looks the label up again after a failure (it may have been deleted in Gmail)', async () => {
      const { g, modifies, listCalls } = labelled([{ id: 'Label_7', name: 'Speaker Dashboard' }], { failModify: 1 })
      await expect(g.label('m1')).rejects.toThrow(/Gmail label failed \(400\)/)
      await g.label('m2')
      expect(listCalls()).toBe(2)
      expect(modifies).toHaveLength(1)
    })
  })

  it('errors carry the status but no response body', async () => {
    const authRequest = vi.fn(async () => ({ data: { signedJwt: 'j' } }))
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('oauth2')
        ? new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }))
        : new Response('to: secret@example.com', { status: 403 }))
    const g = delegatedGmail({ serviceAccount: 's', user: 'x@example.com' }, { authRequest, fetch: fetchFn as unknown as typeof fetch })
    await expect(g.send(raw)).rejects.toThrow(/403/)
    await expect(g.send(raw)).rejects.not.toThrow(/secret@/)
  })

  it('auth failures, including a signJwt network error, start with "Gmail auth" (nothing reached Gmail)', async () => {
    const authRequest = vi.fn(async () => { throw new Error('socket hang up') })
    const fetchFn = vi.fn(async () => new Response('{}'))
    const g = delegatedGmail({ serviceAccount: 's', user: 'x@example.com' }, { authRequest, fetch: fetchFn as unknown as typeof fetch })
    await expect(g.send(raw)).rejects.toThrow(/^Gmail auth failed$/)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('gmailRefused', () => {
  it('is true only for 4xx and auth errors', async () => {
    const { gmailRefused } = await import('../src/email/queue.js')
    expect(gmailRefused(new Error('Gmail send failed (400)'))).toBe(true)
    expect(gmailRefused(new Error('Gmail send failed (429)'))).toBe(true)
    expect(gmailRefused(new Error('Gmail auth: token exchange failed (500)'))).toBe(true)
    expect(gmailRefused(new Error('Gmail send failed (500)'))).toBe(false)
    expect(gmailRefused(new Error('fetch failed'))).toBe(false)
    expect(gmailRefused('x')).toBe(false)
  })
})
