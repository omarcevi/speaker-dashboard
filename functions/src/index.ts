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
import type { SubmissionData } from './model.js';
import { fakeSheet } from './testing/fakeRows.js';
import { fakeAiClient } from './testing/fakeAiClient.js';

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
