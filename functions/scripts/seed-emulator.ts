// Emulator-only. Run via `firebase emulators:exec` (sets the emulator host env vars).
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { applySync } from '../src/sync/applySync.js';
import { applyImport } from '../src/advocu/applyImport.js';
import { fakeAdvocuCsv } from '../src/testing/fakeAdvocu.js';
import { fakeSheet } from '../src/testing/fakeRows.js';
import { refreshAi } from '../src/ai/refreshAi.js';
import { fakeAiClient } from '../src/testing/fakeAiClient.js';
import { seedTemplates } from '../src/email/seedTemplates.js';
import type { EmailDoc, ReceivedMessage, Role, ThreadDoc } from '../src/model.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Refusing to run: emulator host env vars are not set.');
}

const app = initializeApp({ projectId: 'demo-cfp' });
const db = getFirestore(app);
const auth = getAuth(app);

const USERS: { uid: string; email: string; name: string; role: Role }[] = [
  { uid: 'admin-uid', email: 'admin@example.com', name: 'Admin User', role: 'admin' },
  { uid: 'member-uid', email: 'member@example.com', name: 'Member User', role: 'member' },
  { uid: 'waiting-uid', email: 'waiting@example.com', name: 'Waiting User', role: 'waiting' },
];

async function main() {
  await applySync(db, fakeSheet());
  await applyImport(db, fakeAdvocuCsv(), { apply: true, by: { uid: 'seed', name: 'Seed' } });
  // The app only offers Google sign-in, so seed users as Google-provider accounts; the auth
  // emulator's Google popup then lists them.
  const result = await auth.importUsers(USERS.map(u => ({
    uid: u.uid,
    email: u.email,
    displayName: u.name,
    providerData: [{ uid: u.email, email: u.email, displayName: u.name, providerId: 'google.com' }],
  })));
  if (result.failureCount > 0) {
    throw new Error(`importUsers failed: ${result.errors.map(e => e.error.message).join('; ')}`);
  }
  for (const u of USERS) {
    await db.doc(`users/${u.uid}`).set({
      email: u.email, name: u.name, photoURL: '', role: u.role, createdAt: Timestamp.now(),
    });
  }
  // Fake, deterministic AI results (never calls Vertex): overviews, similar talks and the map.
  const ai = await refreshAi(db, fakeAiClient());
  console.log(`AI: ${ai.generated} overviews, map ${ai.mapUpdated ? 'updated' : 'unchanged'}`);
  await seedEmail();
  const [subs, users, emails] = await Promise.all(
    ['submissions', 'users', 'emails'].map(c => db.collection(c).count().get()));
  console.log(`Seeded: ${subs.data().count} submissions, ${users.data().count} users, ${emails.data().count} emails`);
}

const SENDER = 'speakers@example.org';

/**
 * Speaker email: the two seeded templates, filled-in event settings and a little history so the UI has data: an
 * acceptance with a reply (thread `seed-thread-1`), a decline that bounced and a scheduled custom email. Use the
 * emulator-only `devInjectMail` and `devRunMail` callables to add replies and run the queue.
 */
async function seedEmail() {
  await seedTemplates(db);
  const now = Date.now();
  const ts = (msAgo: number) => Timestamp.fromMillis(now - msAgo);
  const DAY = 24 * 60 * 60 * 1000;
  await db.doc('meta/event').set({
    fields: [
      { key: 'eventName', label: 'Event name', value: 'DevFest Example 2026' },
      { key: 'eventDate', label: 'Event date', value: '1 December 2026' },
      { key: 'venue', label: 'Venue', value: 'Example Hall' },
    ],
    updatedAt: ts(3 * DAY), updatedBy: 'admin-uid', updatedByName: 'Admin User',
  });
  const review = { updatedAt: ts(3 * DAY), updatedBy: 'admin-uid', updatedByName: 'Admin User' };
  await db.doc('reviews/row-9').set({ status: 'approved', ...review });
  await db.doc('reviews/row-12').set({ status: 'declined', ...review });

  const base = {
    cc: [], attachments: [], reason: null, manual: false, replyToThreadId: null, claimedAt: null, bounce: null,
    replyCount: 0, lastReplyAt: null, by: 'admin-uid', byName: 'Admin User',
  } satisfies Partial<EmailDoc>;
  const sent = (o: { msAgo: number; gmailMessageId: string; threadId: string }) => ({
    sendAt: ts(o.msAgo), state: 'sent' as const, gmailMessageId: o.gmailMessageId, threadId: o.threadId,
    rfcMessageId: `<${o.gmailMessageId}@example.org>`, sentAt: ts(o.msAgo), createdAt: ts(o.msAgo),
    request: { followUp: false, includeCc: true, custom: null },
  });
  const acceptance: EmailDoc = {
    ...base, ...sent({ msAgo: 2 * DAY, gmailMessageId: 'seed-msg-1', threadId: 'seed-thread-1' }),
    batchId: 'seed-batch-acceptance', speakerKey: 'tim@example.com', to: 'tim@example.com', templateId: 'acceptance',
    templateName: 'Acceptance', rule: 'acceptance', isDecision: true, talkIds: ['row-9'],
    subject: 'You are speaking at DevFest Example 2026',
    text: 'Hi Tim,\n\nGood news: we would love to have you on stage at DevFest Example 2026 with:\n• Fake Web Futures\n\n' +
      'We will send the details soon.\n\nThe DevFest Example 2026 team',
    replyCount: 1, lastReplyAt: ts(DAY),
  };
  const decline: EmailDoc = {
    ...base, ...sent({ msAgo: 2 * DAY, gmailMessageId: 'seed-msg-2', threadId: 'seed-thread-2' }),
    batchId: 'seed-batch-decline', speakerKey: 'hedy@example.com', to: 'hedy@example.com', templateId: 'decline',
    templateName: 'Decline', rule: 'decline', isDecision: true, talkIds: ['row-12'],
    subject: 'Your DevFest Example 2026 submission',
    text: 'Hi Hedy,\n\nThank you for submitting to DevFest Example 2026. We could not fit these talks in this time:\n' +
      '• Frequency Hopping Apps\n\nWe hope to see you at the event.\n\nThe DevFest Example 2026 team',
    bounce: { reason: 'smtp; 550 5.1.1 user unknown', at: ts(2 * DAY - 60_000) },
  };
  const custom = { subject: 'A quick question, {{firstName}}', body: 'Hi {{firstName}},\n\nCould you send us a shorter title?\n\nThanks' };
  const scheduled: EmailDoc = {
    ...base, batchId: 'seed-batch-question', speakerKey: 'donald@example.com', to: 'donald@example.com', templateId: null,
    templateName: 'Custom email', rule: 'anyone', isDecision: false, talkIds: ['row-11'], subject: null, text: null,
    sendAt: Timestamp.fromMillis(now + DAY), state: 'scheduled', gmailMessageId: null, threadId: null, rfcMessageId: null,
    sentAt: null, createdAt: ts(60 * 60 * 1000), request: { followUp: false, includeCc: true, custom },
  };
  const reply: ReceivedMessage = {
    kind: 'reply', from: 'tim@example.com', to: [SENDER], cc: [], at: ts(DAY), subject: 'Re: You are speaking at DevFest Example 2026',
    text: 'Thanks, happy to be there! My slides outline is attached.', quoted: 'On an earlier day, DevFest Example wrote:\n> Hi Tim,',
    attachments: [{ id: 'seed-att-1', name: 'outline.pdf', size: 1234, mimeType: 'application/pdf' }],
  };
  const thread = (speakerKey: string, msgId: string, o: Partial<ThreadDoc>): ThreadDoc => ({
    speakerKey, firstSentAt: ts(2 * DAY), lastCheckedAt: ts(0), seenIds: [msgId], lastReplyAt: null,
    lastTeamAt: ts(2 * DAY), lastSnippet: '', ...o,
  });

  const batch = db.batch();
  batch.set(db.doc('emails/seed-acceptance-tim'), acceptance);
  batch.set(db.doc('emails/seed-decline-hedy'), decline);
  batch.set(db.doc('emails/seed-question-donald'), scheduled);
  batch.set(db.doc('threads/seed-thread-1'), thread('tim@example.com', 'seed-msg-1', {
    seenIds: ['seed-msg-1', 'seed-reply-1'], lastReplyAt: reply.at, lastSnippet: reply.text,
  }));
  batch.set(db.doc('threads/seed-thread-1/messages/seed-reply-1'), reply);
  batch.set(db.doc('threads/seed-thread-2'), thread('hedy@example.com', 'seed-msg-2', { lastSnippet: decline.text!.slice(0, 140) }));
  batch.set(db.doc('meta/mail'), { lastSendAt: ts(2 * DAY), lastPollAt: ts(0), sendError: null, pollError: null });
  await batch.commit();
}

main().catch(err => { console.error(err); process.exit(1); });
