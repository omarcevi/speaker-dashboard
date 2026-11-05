// Emulator-only. Run via `firebase emulators:exec` (sets the emulator host env vars).
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { applySync } from '../src/sync/applySync.js';
import { applyImport } from '../src/advocu/applyImport.js';
import { fakeAdvocuCsv } from '../src/testing/fakeAdvocu.js';
import { fakeSheet } from '../src/testing/fakeRows.js';
import type { Role } from '../src/model.js';

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
  const [subs, users] = await Promise.all([db.collection('submissions').count().get(), db.collection('users').count().get()]);
  console.log(`Seeded: ${subs.data().count} submissions, ${users.data().count} users`);
}

main().catch(err => { console.error(err); process.exit(1); });
