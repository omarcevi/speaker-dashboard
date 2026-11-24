// Gmail access for the dashboard mailbox (MAIL_USER) via domain-wide delegation: the runtime service account signs a
// JWT through IAM Credentials (no key file), trades it for a user token, and calls the Gmail REST API.
// Server-only. Errors carry HTTP status text only, never addresses or message bodies.
import { GoogleAuth } from 'google-auth-library'
import type { GmailMessage } from './parseMessage.js'

export interface GmailClient {
  send(raw: string, threadId?: string): Promise<{ id: string; threadId: string }>
  getThread(threadId: string): Promise<GmailMessage[]>
  getAttachment(messageId: string, attachmentId: string): Promise<Buffer>
  /** Adds the dashboard's Gmail label to a message, creating the label the first time. */
  label(messageId: string): Promise<void>
}

export interface DelegatedGmailDeps {
  /** Authenticated request to IAM Credentials; defaults to Application Default Credentials. */
  authRequest?: (opts: { url: string; method: 'POST'; data: unknown }) => Promise<{ data: unknown }>
  fetch?: typeof fetch
  now?: () => number
}

// gmail.modify reads mail and adds labels; the dashboard never archives, trashes or deletes.
const SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const REFRESH_MARGIN_MS = 5 * 60 * 1000

export function delegatedGmail(opts: { serviceAccount: string; user: string; label?: string }, deps: DelegatedGmailDeps = {}): GmailClient {
  const doFetch = deps.fetch ?? fetch
  const now = deps.now ?? Date.now
  let auth: GoogleAuth | undefined
  const authRequest =
    deps.authRequest ??
    (async (o: { url: string; method: 'POST'; data: unknown }) => {
      auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
      const client = await auth.getClient()
      return client.request(o)
    })
  let cached: { token: string; expiresAt: number } | undefined

  async function token(): Promise<string> {
    if (cached && now() < cached.expiresAt - REFRESH_MARGIN_MS) return cached.token
    const iat = Math.floor(now() / 1000)
    const claims = { iss: opts.serviceAccount, sub: opts.user, scope: SCOPES, aud: TOKEN_URL, iat, exp: iat + 3600 }
    const signed = await authRequest({
      url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${opts.serviceAccount}:signJwt`,
      method: 'POST',
      data: { payload: JSON.stringify(claims) },
    })
    const signedJwt = (signed.data as { signedJwt?: string }).signedJwt
    if (!signedJwt) throw new Error('Gmail auth: signJwt returned no token')
    const res = await doFetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signedJwt }).toString(),
    })
    if (!res.ok) throw new Error(`Gmail auth: token exchange failed (${res.status})`)
    const j = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!j.access_token) throw new Error('Gmail auth: token exchange returned no access token')
    cached = { token: j.access_token, expiresAt: now() + (j.expires_in ?? 3600) * 1000 }
    return cached.token
  }

  // Any error before the Gmail call starts with "Gmail auth", so the queue knows nothing reached Gmail.
  const authToken = () => token().catch((e: unknown) => {
    throw e instanceof Error && e.message.startsWith('Gmail auth') ? e : new Error('Gmail auth failed')
  })

  async function call<T>(what: string, path: string, init?: { body?: unknown }): Promise<T> {
    const bearer = await authToken()
    const res = await doFetch(`${GMAIL}${path}`, {
      method: init?.body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
    if (!res.ok) throw new Error(`Gmail ${what} failed (${res.status})`)
    return (await res.json()) as T
  }

  const labelName = opts.label ?? 'Speaker Dashboard'
  let labelId: Promise<string> | undefined
  async function findOrCreateLabel(): Promise<string> {
    const find = async () => (await call<{ labels?: { id: string; name: string }[] }>('labels', '/labels')).labels
      ?.find(l => l.name.toLowerCase() === labelName.toLowerCase())?.id
    const found = await find()
    if (found) return found
    try {
      const body = { name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show' }
      return (await call<{ id: string }>('createLabel', '/labels', { body })).id
    } catch (e) {
      // Another run may have created it in the meantime (409).
      const again = await find()
      if (again) return again
      throw e
    }
  }

  return {
    async label(messageId) {
      try {
        const id = await (labelId ??= findOrCreateLabel())
        await call('label', `/messages/${encodeURIComponent(messageId)}/modify`, { body: { addLabelIds: [id] } })
      } catch (e) {
        // Look it up again next time: the label may have been renamed or deleted in Gmail.
        labelId = undefined
        throw e
      }
    },
    async send(raw, threadId) {
      const r = await call<{ id: string; threadId: string }>('send', '/messages/send', { body: threadId ? { raw, threadId } : { raw } })
      return { id: r.id, threadId: r.threadId }
    },
    async getThread(threadId) {
      const r = await call<{ messages?: GmailMessage[] }>('getThread', `/threads/${encodeURIComponent(threadId)}?format=full`)
      return r.messages ?? []
    },
    async getAttachment(messageId, attachmentId) {
      const r = await call<{ data?: string }>('getAttachment', `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`)
      return Buffer.from(r.data ?? '', 'base64url')
    },
  }
}
