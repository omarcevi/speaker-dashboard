import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { getStorage } from 'firebase-admin/storage';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { requireRole } from './access.js';
import { readSheet } from './sync/readSheet.js';
import { runSync } from './sync/runSync.js';
import { syncPhotos } from './photos/syncPhotos.js';
import type { SubmissionData } from './model.js';
import { fakeSheet } from './testing/fakeRows.js';

initializeApp();

const SHEET_ID = defineString('SHEET_ID');
const SHEET_TAB = defineString('SHEET_TAB', { default: 'Form Responses 1' });
const SYNC_SERVICE_ACCOUNT = defineString('SYNC_SERVICE_ACCOUNT');

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

export const syncNow = onCall({ region, serviceAccount: SYNC_SERVICE_ACCOUNT, timeoutSeconds: 300 }, async request => {
  await requireRole(request.auth?.uid, ['member', 'admin']);
  return runSync(getFirestore(), reader(), { photos: photos() });
});

export const scheduledSync = onSchedule(
  { region, serviceAccount: SYNC_SERVICE_ACCOUNT, schedule: 'every 15 minutes', timeoutSeconds: 300 },
  async () => { await runSync(getFirestore(), reader(), { photos: photos() }); },
);
