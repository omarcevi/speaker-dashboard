import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { parseSheet } from '../sheet/parseSheet.js';
import type { SubmissionData, SyncResult } from '../model.js';
import { applySync } from './applySync.js';

export interface RunSyncOptions {
  now?: Date;
  photos?: (subs: SubmissionData[]) => Promise<unknown>;
}

/** Reads the sheet and applies it. A failure is recorded in `meta/sync` (lastSyncedAt stays) and rethrown. */
export async function runSync(
  db: Firestore, read: () => Promise<string[][]>, opts: RunSyncOptions = {},
): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  try {
    const values = await read();
    // An empty read must not reach applySync, which would soft-remove every submission.
    if (values.length < 2) throw new Error('Sheet returned no rows');
    const result = await applySync(db, values, now);
    await opts.photos?.(parseSheet(values).submissions);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.doc('meta/sync').set({ error: message, lastErrorAt: Timestamp.fromDate(now) }, { merge: true });
    throw err;
  }
}
