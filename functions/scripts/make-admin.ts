// Usage: npx tsx scripts/make-admin.ts you@x.com
// Uses Application Default Credentials; set GOOGLE_CLOUD_PROJECT (or use emulator env vars).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npx tsx scripts/make-admin.ts <email>');
  process.exit(1);
}

async function main() {
  const db = getFirestore(initializeApp());
  const snap = await db.collection('users').where('email', '==', email).get();
  if (snap.empty) {
    console.error(`No user with email ${email}. Sign in to the dashboard once first, and check the spelling.`);
    process.exit(1);
  }
  if (snap.size > 1) {
    console.error(`Expected exactly one user with email ${email}, found ${snap.size}.`);
    process.exit(1);
  }
  await snap.docs[0].ref.update({ role: 'admin' });
  console.log(`${email} is now an admin.`);
}

main().catch(err => { console.error(err); process.exit(1); });
