import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase.ts'

/** `html` is the message as written; leave it out to send `body` as paragraphs. */
export interface CustomEmail { subject: string; body: string; html?: string }

export interface QueueEmailsInput {
  batchId: string
  templateId: string | null
  custom: CustomEmail | null
  speakerKeys: string[]
  followUp: boolean
  sendAt: number | null // epoch ms; null = send now
  includeCc: boolean
  replyToThreadId: string | null
}
export interface QueueEmailsResult { queued: string[]; skipped: { speakerKey: string; reason: string }[] }

export interface SendTestEmailInput { templateId?: string | null; custom?: CustomEmail | null; speakerKey: string; followUp?: boolean }

export interface EmailAttachmentInput { threadId: string; messageId: string; attachmentId: string }
export interface EmailAttachmentResult { name: string; mimeType: string; base64: string }

const call = <I, O>(name: string) => async (input: I): Promise<O> => (await httpsCallable<I, O>(functions, name)(input)).data

export const queueEmails = call<QueueEmailsInput, QueueEmailsResult>('queueEmails')
export const sendTestEmail = call<SendTestEmailInput, { ok: true }>('sendTestEmail')
export const cancelEmail = (id: string) => call<{ id: string }, { ok: true }>('cancelEmail')({ id })
export const rescheduleEmail = (id: string, sendAt: number) => call<{ id: string; sendAt: number }, { ok: true }>('rescheduleEmail')({ id, sendAt })
export const resolveUnknownEmail = (id: string, to: 'sent' | 'requeue') =>
  call<{ id: string; to: 'sent' | 'requeue' }, { ok: true }>('resolveUnknownEmail')({ id, to })
export const retryEmail = (id: string) => call<{ id: string }, { ok: true }>('retryEmail')({ id })
/** `at` is optional so a retried call with the same value creates nothing new. */
export const markEmailed = call<{ templateId: string; speakerKeys: string[]; at?: number }, { created: number }>('markEmailed')
export const emailAttachment = call<EmailAttachmentInput, EmailAttachmentResult>('emailAttachment')
/** Asks the AI for a fresh draft of an answer to the thread's newest reply; the draft lands on the thread doc. */
export const draftReply = call<{ threadId: string }, { ok: true }>('draftReplyNow')
