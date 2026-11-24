import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { getStorage } from 'firebase-admin/storage';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { requireRole } from './access.js';
import { readSheet } from './sync/readSheet.js';
import { runSync } from './sync/runSync.js';
import { applyImport } from './advocu/applyImport.js';
import { ImportRefused } from './advocu/parseAdvocu.js';
import { syncPhotos } from './photos/syncPhotos.js';
import { refreshAi as runAiRefresh, AiNotFound } from './ai/refreshAi.js';
import type { AiClient } from './ai/client.js';
import type { MailMeta, SubmissionData } from './model.js';
import { fakeSheet } from './testing/fakeRows.js';
import { fakeAiClient } from './testing/fakeAiClient.js';
import { delegatedGmail, type GmailClient } from './email/gmail.js';
import type { GmailMessage } from './email/parseMessage.js';
import {
  cancelEmail as runCancelEmail, enqueue, markEmailed as runMarkEmailed, processQueue, QueueRefused,
  rescheduleEmail as runRescheduleEmail, resolveUnknown, retryEmail as runRetryEmail, sendTestEmail as runSendTestEmail,
  type Actor, type EnqueueInput,
} from './email/queue.js';
import { AttachmentTooLarge, attachmentFor, pollMail } from './email/pollMail.js';
import { seedTemplates } from './email/seedTemplates.js';
import { sharedFakeGmail } from './testing/fakeGmail.js';

initializeApp();

const SHEET_ID = defineString('SHEET_ID');
const SHEET_TAB = defineString('SHEET_TAB', { default: 'Form Responses 1' });
const SYNC_SERVICE_ACCOUNT = defineString('SYNC_SERVICE_ACCOUNT');
const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';
// MAIL_USER is the real Workspace mailbox the dashboard signs in to (sends from, reads replies in).
// MAIL_SENDER is the From address speakers see: the same mailbox, or a group that MAIL_USER belongs to
// and has under Gmail's "Send mail as". Required on deploy; the emulator uses made-up addresses (its Gmail is the fake).
const MAIL_USER = defineString('MAIL_USER', isEmulator() ? { default: 'organizer@example.org' } : {});
const MAIL_SENDER = defineString('MAIL_SENDER', isEmulator() ? { default: 'speakers@example.org' } : {});
// The Gmail label put on every email the dashboard sends, so its conversations can be filtered in MAIL_USER's inbox.
const MAIL_LABEL = defineString('MAIL_LABEL', { default: 'Speaker Dashboard' });

const region = 'europe-west1';

function reader(): () => Promise<string[][]> {
  if (isFake()) {
    return async () => fakeSheet();
  }
  return () => readSheet(SHEET_ID.value(), SHEET_TAB.value());
}

const isFake = () => process.env.FUNCTIONS_EMULATOR === 'true' && SHEET_ID.value() === 'fake';

/** Copies Drive photos into Storage. Not used with the emulator's fake sheet (fake ids can't be downloaded). */
function photos(): ((subs: SubmissionData[]) => Promise<unknown>) | undefined {
  if (isFake()) return undefined;
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth });
  const bucket = getStorage().bucket();
  return async subs => {
    const r = await syncPhotos(subs, {
      exists: async path => (await bucket.file(path).exists())[0],
      meta: async fileId => {
        const res = await drive.files.get({ fileId, fields: 'mimeType,size', supportsAllDrives: true });
        return { mimeType: res.data.mimeType ?? '', size: Number(res.data.size ?? Infinity) };
      },
      download: async fileId => {
        const res = await drive.files.get(
          { fileId, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer', maxContentLength: 10 * 1024 * 1024 },
        );
        return { data: Buffer.from(res.data as ArrayBuffer) };
      },
      save: async (path, data, contentType) => { await bucket.file(path).save(data, { contentType, resumable: false }); },
    });
    console.log(`Photo sync: copied=${r.copied} skipped=${r.skipped} failed=[${r.failed.join(',')}]`);
    return r;
  };
}

/**
 * Vertex AI in this project, inside the EU: generation on the `eu` multi-region, embeddings in europe-west1.
 * The emulator gets the fake, so it never calls Vertex. The SDK is imported here, on first use, so the sync and
 * import functions never load it.
 */
async function aiClient(): Promise<AiClient> {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return fakeAiClient();
  const project = process.env.GCLOUD_PROJECT;
  if (!project) throw new Error('GCLOUD_PROJECT not set');
  const { vertexAiClient, OVERVIEW_MODEL, EMBED_MODEL } = await import('./ai/client.js');
  return vertexAiClient({
    project, generationLocation: 'eu', embedLocation: 'europe-west1', overviewModel: OVERVIEW_MODEL, embedModel: EMBED_MODEL,
  });
}

export const syncNow = onCall({ region, serviceAccount: SYNC_SERVICE_ACCOUNT, timeoutSeconds: 300, memory: '512MiB' }, async request => {
  await requireRole(request.auth?.uid, ['member', 'admin']);
  return runSync(getFirestore(), reader(), { photos: photos() });
});

export const importAdvocu = onCall({ region, serviceAccount: SYNC_SERVICE_ACCOUNT, timeoutSeconds: 300, memory: '512MiB' }, async request => {
  const user = await requireRole(request.auth?.uid, ['admin']);
  const { csv, mode } = (request.data ?? {}) as { csv?: unknown; mode?: unknown };
  if (typeof csv !== 'string' || csv.length === 0 || csv.length > 5_000_000) {
    throw new HttpsError('invalid-argument', 'csv must be a non-empty string of at most 5,000,000 characters.');
  }
  if (mode !== 'preview' && mode !== 'apply') {
    throw new HttpsError('invalid-argument', 'mode must be "preview" or "apply".');
  }
  try {
    return await applyImport(getFirestore(), csv, { apply: mode === 'apply', by: { uid: request.auth!.uid, name: user.name } });
  } catch (e) {
    if (e instanceof ImportRefused) throw new HttpsError('invalid-argument', e.message);
    throw e;
  }
});

export const scheduledSync = onSchedule(
  { region, serviceAccount: SYNC_SERVICE_ACCOUNT, schedule: 'every 15 minutes', timeoutSeconds: 300, memory: '512MiB' },
  async () => { await runSync(getFirestore(), reader(), { photos: photos() }); },
);

export const refreshAi = onSchedule(
  { region, serviceAccount: SYNC_SERVICE_ACCOUNT, schedule: 'every 15 minutes', timeoutSeconds: 540, memory: '512MiB' },
  async () => { await runAiRefresh(getFirestore(), await aiClient()); },
);

export const regenerateAi = onCall({ region, serviceAccount: SYNC_SERVICE_ACCOUNT, timeoutSeconds: 300, memory: '512MiB' }, async request => {
  await requireRole(request.auth?.uid, ['admin']);
  const { id } = (request.data ?? {}) as { id?: unknown };
  if (typeof id !== 'string' || id.trim() === '') {
    throw new HttpsError('invalid-argument', 'id must be a non-empty string.');
  }
  let result;
  try {
    result = await runAiRefresh(getFirestore(), await aiClient(), { onlyId: id, cap: 1 });
  } catch (e) {
    if (e instanceof AiNotFound) throw new HttpsError('not-found', e.message);
    throw e;
  }
  // The cause is on ai/{id}.error and in the log; the caller gets a plain message.
  if (result.failed.includes(id)) throw new HttpsError('internal', 'Could not regenerate this overview — try again later.');
  return result;
});

// ---- Speaker email ----

/**
 * The emulator's mailbox: the in-memory fake (one instance per worker, so a run's sends and polls share it), plus the
 * messages `devInjectMail` stored in Firestore — the emulator runs each function in its own worker, so they can't be
 * handed over in memory.
 */
function emulatorGmail(): GmailClient {
  const fake = sharedFakeGmail();
  return {
    send: (raw, threadId) => fake.send(raw, threadId),
    getAttachment: (messageId, attachmentId) => fake.getAttachment(messageId, attachmentId),
    label: (messageId) => fake.label(messageId),
    listMessages: (query) => fake.listMessages(query),
    async getThread(threadId) {
      const injected = await getFirestore().collection('devMail').where('threadId', '==', threadId).get();
      return [...await fake.getThread(threadId), ...injected.docs.map(d => JSON.parse(d.get('json') as string) as GmailMessage)];
    },
  };
}

/** The dashboard mailbox (MAIL_USER). */
let realGmail: GmailClient | undefined;
function gmailClient(): GmailClient {
  if (isEmulator()) return emulatorGmail();
  // Kept per instance so its access token is reused across runs.
  return realGmail ??= delegatedGmail({ serviceAccount: SYNC_SERVICE_ACCOUNT.value(), user: MAIL_USER.value(), label: MAIL_LABEL.value() });
}

const readAttachment = async (path: string) => (await getStorage().bucket().file(path).download())[0];

/** A non-personal code for meta/mail and logs: the HTTP status from our Gmail errors, or a gRPC code. */
function errorCode(e: unknown): string {
  const http = /\((\d{3})\)/.exec(e instanceof Error ? e.message : '')?.[1];
  if (http) return `http ${http}`;
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'number' || (typeof code === 'string' && /^[\w-]{1,40}$/.test(code)) ? `code ${code}` : 'unknown';
}

const MAX_SPEAKERS = 500;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const BATCH_ID = /^[A-Za-z0-9-]{8,64}$/;
const ID = /^[A-Za-z0-9_-]{1,200}$/;

const bad = (message: string) => new HttpsError('invalid-argument', message);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);

function custom(v: unknown): { subject: string; body: string; html?: string } | null {
  if (v === null) return null;
  if (!isObject(v) || typeof v.subject !== 'string' || typeof v.body !== 'string' || v.subject.length > 1_000 || v.body.length > 100_000) {
    throw bad('custom must be null or { subject, body } strings.');
  }
  // A null html is the same as none.
  if (v.html != null && (typeof v.html !== 'string' || v.html.length > 200_000)) throw bad('custom.html must be a string.');
  return v.html == null ? { subject: v.subject, body: v.body } : { subject: v.subject, body: v.body, html: v.html };
}

function speakerKeys(v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_SPEAKERS || !v.every(k => typeof k === 'string' && k.length > 0 && k.length <= 400)) {
    throw bad(`speakerKeys must be 1 to ${MAX_SPEAKERS} non-empty strings.`);
  }
  return v;
}

function finiteTime(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(`${name} must be a time in milliseconds.`);
  return v;
}

/** Admin (or the given roles) check that also returns the actor for history entries. */
async function actor(uid: string | undefined, roles: ('admin' | 'member')[] = ['admin']): Promise<Actor> {
  const user = await requireRole(uid, roles);
  return { uid: uid!, name: user.name };
}

/** Runs a queue action, turning a refusal into a failed-precondition the UI can show. */
async function refusable<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof QueueRefused) throw new HttpsError('failed-precondition', e.message);
    throw e;
  }
}

const mailOpts = { region, serviceAccount: SYNC_SERVICE_ACCOUNT, timeoutSeconds: 300, memory: '512MiB' as const };

function parseEnqueue(data: unknown): EnqueueInput {
  if (!isObject(data)) throw bad('Missing input.');
  const { batchId, templateId, followUp, sendAt, includeCc, replyToThreadId } = data;
  if (typeof batchId !== 'string' || !BATCH_ID.test(batchId)) throw bad('batchId must be 8 to 64 letters, digits or dashes.');
  if (templateId !== null && !isId(templateId)) throw bad('templateId must be null or a template id.');
  if (typeof followUp !== 'boolean' || typeof includeCc !== 'boolean') throw bad('followUp and includeCc must be true or false.');
  if (sendAt !== null) finiteTime(sendAt, 'sendAt');
  if (replyToThreadId !== null && !isId(replyToThreadId)) throw bad('replyToThreadId must be null or a thread id.');
  return {
    batchId, templateId, custom: custom(data.custom), speakerKeys: speakerKeys(data.speakerKeys), followUp,
    sendAt: sendAt as number | null, includeCc, replyToThreadId,
  };
}

export const queueEmails = onCall(mailOpts, async request => {
  const by = await actor(request.auth?.uid);
  const input = parseEnqueue(request.data);
  const db = getFirestore();
  await seedTemplates(db);
  return refusable(() => enqueue(db, input, by));
});

export const sendTestEmail = onCall(mailOpts, async request => {
  await actor(request.auth?.uid);
  const data = request.data;
  if (!isObject(data)) throw bad('Missing input.');
  const { templateId, speakerKey, followUp } = data;
  if (templateId !== undefined && templateId !== null && !isId(templateId)) throw bad('templateId must be a template id.');
  if (typeof speakerKey !== 'string' || speakerKey.length === 0 || speakerKey.length > 400) throw bad('speakerKey must be a non-empty string.');
  if (followUp !== undefined && typeof followUp !== 'boolean') throw bad('followUp must be true or false.');
  const db = getFirestore();
  // The caller's own address, from their user doc: a test never goes to anyone else.
  const to = (await db.doc(`users/${request.auth!.uid}`).get()).get('email');
  if (typeof to !== 'string' || !to.includes('@')) throw new HttpsError('failed-precondition', 'Your account has no email address.');
  const input = { templateId: (templateId as string | null | undefined) ?? null, custom: custom(data.custom ?? null), speakerKey, followUp };
  await refusable(async () =>
    runSendTestEmail(db, gmailClient(), input, to, { sender: MAIL_SENDER.value(), readAttachment }));
  return { ok: true };
});

export const cancelEmail = onCall(mailOpts, async request => {
  const by = await actor(request.auth?.uid);
  const { id } = (request.data ?? {}) as { id?: unknown };
  if (!isId(id)) throw bad('id must be an email id.');
  await refusable(() => runCancelEmail(getFirestore(), id, by));
  return { ok: true };
});

export const rescheduleEmail = onCall(mailOpts, async request => {
  const by = await actor(request.auth?.uid);
  const { id, sendAt } = (request.data ?? {}) as { id?: unknown; sendAt?: unknown };
  if (!isId(id)) throw bad('id must be an email id.');
  const at = finiteTime(sendAt, 'sendAt');
  await refusable(() => runRescheduleEmail(getFirestore(), id, at, by));
  return { ok: true };
});

export const resolveUnknownEmail = onCall(mailOpts, async request => {
  const by = await actor(request.auth?.uid);
  const { id, to } = (request.data ?? {}) as { id?: unknown; to?: unknown };
  if (!isId(id)) throw bad('id must be an email id.');
  if (to !== 'sent' && to !== 'requeue') throw bad('to must be "sent" or "requeue".');
  await refusable(() => resolveUnknown(getFirestore(), id, to, by));
  return { ok: true };
});

export const retryEmail = onCall(mailOpts, async request => {
  const by = await actor(request.auth?.uid);
  const { id } = (request.data ?? {}) as { id?: unknown };
  if (!isId(id)) throw bad('id must be an email id.');
  await refusable(() => runRetryEmail(getFirestore(), id, by));
  return { ok: true };
});

export const markEmailed = onCall(mailOpts, async request => {
  const by = await actor(request.auth?.uid);
  const { templateId, speakerKeys: keys, at } = (request.data ?? {}) as { templateId?: unknown; speakerKeys?: unknown; at?: unknown };
  if (!isId(templateId)) throw bad('templateId must be a template id.');
  // Optional so a retried call (same `at`) creates nothing new; never in the future.
  const now = Date.now();
  const when = at === undefined ? now : finiteTime(at, 'at');
  if (when > now + 5 * 60 * 1000) throw bad('at must not be in the future.');
  if (when < now - 365 * 24 * 60 * 60 * 1000) throw bad('at must be within the last 365 days.');
  const created = await refusable(() => runMarkEmailed(getFirestore(), { templateId, speakerKeys: speakerKeys(keys), at: when }, by));
  return { created };
});

export const emailAttachment = onCall(mailOpts, async request => {
  await actor(request.auth?.uid, ['member', 'admin']);
  const { threadId, messageId, attachmentId } = (request.data ?? {}) as Record<string, unknown>;
  if (!isId(threadId) || !isId(messageId) || typeof attachmentId !== 'string' || attachmentId.length === 0 || attachmentId.length > 2_000) {
    throw bad('threadId, messageId and attachmentId must be ids.');
  }
  let a;
  try {
    a = await attachmentFor(getFirestore(), gmailClient(), threadId, messageId, attachmentId, { maxBytes: MAX_ATTACHMENT_BYTES });
  } catch (e) {
    if (e instanceof AttachmentTooLarge) throw new HttpsError('failed-precondition', 'This attachment is over 10 MB. Open it in Gmail instead.');
    if (e instanceof Error && e.message === 'Attachment not found') throw new HttpsError('not-found', e.message);
    throw e;
  }
  return { name: a.name, mimeType: a.mimeType, base64: a.data.toString('base64') };
});

/** One send run; a crash is recorded on meta/mail as a code, never a message that could hold personal data. */
async function sendDue() {
  const db = getFirestore();
  try {
    await seedTemplates(db);
    const counts = await processQueue(db, gmailClient(), { sender: MAIL_SENDER.value(), now: Date.now(), readAttachment });
    await db.doc('meta/mail').set({ sendError: null } satisfies Partial<MailMeta>, { merge: true });
    return counts;
  } catch (e) {
    const code = errorCode(e);
    console.error(`Email queue: run failed (${code})`);
    await db.doc('meta/mail').set({ sendError: `Sending failed (${code})` } satisfies Partial<MailMeta>, { merge: true });
    throw e;
  }
}

const poll = async () => pollMail(getFirestore(), gmailClient(), { sender: MAIL_SENDER.value(), now: Date.now() });

export const sendDueEmails = onSchedule(
  { region, serviceAccount: SYNC_SERVICE_ACCOUNT, schedule: 'every 1 minutes', timeoutSeconds: 300, memory: '512MiB' },
  async () => { await sendDue(); },
);

export const pollMailbox = onSchedule(
  { region, serviceAccount: SYNC_SERVICE_ACCOUNT, schedule: 'every 5 minutes', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    try {
      await poll();
    } catch (e) {
      const code = errorCode(e);
      console.error(`Mail poll: run failed (${code})`);
      await getFirestore().doc('meta/mail').set({ pollError: `Checking replies failed (${code})` } satisfies Partial<MailMeta>, { merge: true });
      throw e;
    }
  },
);

// ---- Emulator-only dev hooks: not exported (so never deployed) outside the emulator, and refuse there too. ----

function requireEmulator(): void {
  if (!isEmulator()) throw new HttpsError('failed-precondition', 'Only available in the emulator.');
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');

/** A made-up reply or bounce, shaped like Gmail's format=full. */
function devMessage(threadId: string, kind: 'reply' | 'bounce', text: string): GmailMessage {
  const now = Date.now();
  const id = `dev-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const headers = (from: string, subject: string, contentType?: string) => [
    { name: 'From', value: from },
    { name: 'To', value: MAIL_SENDER.value() },
    { name: 'Subject', value: subject },
    { name: 'Message-ID', value: `<${id}@example.com>` },
    { name: 'Date', value: new Date(now).toUTCString() },
    ...(contentType ? [{ name: 'Content-Type', value: contentType }] : []),
  ];
  const base = { id, threadId, labelIds: ['INBOX'], internalDate: String(now) };
  if (kind === 'reply') {
    return { ...base, payload: { mimeType: 'text/plain', headers: headers('Fake Speaker <speaker@example.com>', 'Re: Fake email'), body: { data: b64(text) } } };
  }
  return {
    ...base,
    payload: {
      mimeType: 'multipart/report',
      headers: headers('Mail Delivery Subsystem <mailer-daemon@googlemail.com>', 'Delivery Status Notification (Failure)',
        'multipart/report; report-type=delivery-status; boundary="dev"'),
      parts: [
        { mimeType: 'text/plain', headers: [], body: { data: b64(text) } },
        { mimeType: 'message/delivery-status', headers: [], body: { data: b64('Status: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 user unknown') } },
      ],
    },
  };
}

const devInjectMailFn = onCall({ region, serviceAccount: SYNC_SERVICE_ACCOUNT }, async request => {
  requireEmulator();
  await actor(request.auth?.uid);
  const { threadId, kind, text } = (request.data ?? {}) as Record<string, unknown>;
  if (!isId(threadId)) throw bad('threadId must be a thread id.');
  if (kind !== 'reply' && kind !== 'bounce') throw bad('kind must be "reply" or "bounce".');
  if (typeof text !== 'string' || text.length > 10_000) throw bad('text must be a string.');
  const m = devMessage(threadId, kind, text);
  // Stored, not added to this worker's fake: emulatorGmail() in the worker that polls reads it from here.
  await getFirestore().doc(`devMail/${m.id}`).set({ threadId, json: JSON.stringify(m) });
  return { id: m.id };
});

const devRunMailFn = onCall({ region, serviceAccount: SYNC_SERVICE_ACCOUNT, timeoutSeconds: 300 }, async request => {
  requireEmulator();
  await actor(request.auth?.uid);
  const sent = await sendDue();
  const polled = await poll();
  return { sent, polled };
});

export const devInjectMail = isEmulator() ? devInjectMailFn : undefined;
export const devRunMail = isEmulator() ? devRunMailFn : undefined;
