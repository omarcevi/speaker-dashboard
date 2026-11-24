// In-memory Gmail for the emulator and unit tests. Deterministic ids; sent mail is kept per thread.
import type { GmailClient } from '../email/gmail.js'
import type { GmailMessage } from '../email/parseMessage.js'

export type FakeGmail = GmailClient & {
  sent: { raw: string; threadId?: string }[]
  /** Message ids given the dashboard label, in order. */
  labelled: string[]
  addReply(threadId: string, m: GmailMessage): void
  failNext(err: Error): void
}

function toMessage(raw: string, id: string, threadId: string): GmailMessage {
  const text = Buffer.from(raw, 'base64url').toString('utf8')
  const split = text.search(/\r?\n\r?\n/)
  const head = split < 0 ? text : text.slice(0, split)
  const body = split < 0 ? '' : text.slice(split).replace(/^\r?\n\r?\n/, '')
  const headers = ['From', 'To', 'Subject', 'Message-ID'].flatMap(name => {
    const m = new RegExp(`^${name}:[ \\t]*(.*)$`, 'im').exec(head)
    return m ? [{ name, value: m[1].trim() }] : []
  })
  return {
    id,
    threadId,
    labelIds: ['SENT'],
    internalDate: String(Date.now()),
    payload: { mimeType: 'text/plain', headers, body: { data: Buffer.from(body).toString('base64url') } },
  }
}

export function fakeGmail(): FakeGmail {
  const threads = new Map<string, GmailMessage[]>()
  const sent: FakeGmail['sent'] = []
  const labelled: string[] = []
  let msgN = 0
  let threadN = 0
  let failure: Error | undefined
  return {
    sent,
    labelled,
    async listMessages() {
      // Every sent message, newest first; the fake ignores the query.
      return [...threads.values()].flat().filter((m) => m.labelIds?.includes('SENT'))
        .map((m) => ({ id: m.id!, threadId: m.threadId! })).reverse()
    },
    async label(messageId) {
      labelled.push(messageId)
    },
    async send(raw, threadId) {
      if (failure) {
        const e = failure
        failure = undefined
        throw e
      }
      const tid = threadId ?? `fake-thread-${++threadN}`
      const id = `fake-msg-${++msgN}`
      sent.push(threadId ? { raw, threadId } : { raw })
      threads.set(tid, [...(threads.get(tid) ?? []), toMessage(raw, id, tid)])
      return { id, threadId: tid }
    },
    async getThread(threadId) {
      return [...(threads.get(threadId) ?? [])]
    },
    async getAttachment() {
      return Buffer.alloc(0)
    },
    addReply(threadId, m) {
      threads.set(threadId, [...(threads.get(threadId) ?? []), m])
    },
    failNext(err) {
      failure = err
    },
  }
}

let shared: FakeGmail | undefined
/** One instance for the emulator's send and poll paths to share. */
export function sharedFakeGmail(): FakeGmail {
  return (shared ??= fakeGmail())
}
