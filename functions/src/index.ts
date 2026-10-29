import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { requireRole } from './access.js';
import { readSheet } from './sync/readSheet.js';
import { runSync } from './sync/runSync.js';
import { fakeSheet } from './testing/fakeRows.js';

initializeApp();

const SHEET_ID = defineString('SHEET_ID');
const SHEET_TAB = defineString('SHEET_TAB', { default: 'Form Responses 1' });
const SYNC_SERVICE_ACCOUNT = defineString('SYNC_SERVICE_ACCOUNT');

const region = 'europe-west1';

function reader(): () => Promise<string[][]> {
  if (process.env.FUNCTIONS_EMULATOR === 'true' && SHEET_ID.value() === 'fake') {
    return async () => fakeSheet();
  }
  return () => readSheet(SHEET_ID.value(), SHEET_TAB.value());
}

export const syncNow = onCall({ region, serviceAccount: SYNC_SERVICE_ACCOUNT }, async request => {
  await requireRole(request.auth?.uid, ['member', 'admin']);
  return runSync(getFirestore(), reader());
});

export const scheduledSync = onSchedule(
  { region, serviceAccount: SYNC_SERVICE_ACCOUNT, schedule: 'every 15 minutes' },
  async () => { await runSync(getFirestore(), reader()); },
);
