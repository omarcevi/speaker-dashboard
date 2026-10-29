// Emulator-only. Run via `firebase emulators:exec` (sets the emulator host env vars).
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { applySync } from '../src/sync/applySync.js';
import { fakeSheet } from '../src/testing/fakeRows.js';
import type { Role } from '../src/model.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Refusing to run: emulator host env vars are not set.');
}

const app = initializeApp({ projectId: 'demo-cfp' });
const db = getFirestore(app);
const auth = getAuth(app);

const USERS: { email: string; name: string; role: Role }[] = [
  { email: 'admin@example.com', name: 'Admin User', role: 'admin' },
  { email: 'member@example.com', name: 'Member User', role: 'member' },
  { email: 'waiting@example.com', name: 'Waiting User', role: 'waiting' },
];

async function main() {
  await applySync(db, fakeSheet());
  for (const u of USERS) {
    const rec = await auth.createUser({ email: u.email, displayName: u.name, password: 'password123' });
    await db.doc(`users/${rec.uid}`).set({
      email: u.email, name: u.name, photoURL: '', role: u.role, createdAt: Timestamp.now(),
    });
  }
  const [subs, users] = await Promise.all([db.collection('submissions').count().get(), db.collection('users').count().get()]);
  console.log(`Seeded: ${subs.data().count} submissions, ${users.data().count} users`);
}

main().catch(err => { console.error(err); process.exit(1); });
