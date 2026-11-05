import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { parseSheet } from '../sheet/parseSheet.js';
import type { SyncResult } from '../model.js';
import { planSync } from './planSync.js';

const BATCH_SIZE = 450;

/** Upserts sheet rows into `submissions` and writes `meta/sync`. Touches nothing else. */
export async function applySync(db: Firestore, values: string[][], now?: Date): Promise<SyncResult> {
  const { submissions, missingColumns } = parseSheet(values);
  const requiredMissing = missingColumns.filter(c => c === 'timestamp' || c === 'email' || c === 'title');
  if (requiredMissing.length > 0) {
    throw new Error(`Required columns missing from the sheet: ${requiredMissing.join(', ')}. Check the header row of "Form Responses 1".`);
  }
  const at = Timestamp.fromDate(now ?? new Date());

  const snap = await db.collection('submissions').select('source', 'contentHash', 'removedFromSheet').get();
  const existing = snap.docs.filter(d => d.get('source') !== 'advocu').map(d => ({
    id: d.id,
    contentHash: d.get('contentHash') as string,
    removedFromSheet: d.get('removedFromSheet') === true,
  }));
  const plan = planSync(submissions, existing);

  if (plan.moved.length > 0) {
    const ex = plan.moved[0]!;
    throw new Error(`Rows moved in the sheet (${plan.moved.length} rows, e.g. ${ex.from} is now ${ex.id}). Undo the sort/insert/delete in "Form Responses 1". Sync is paused so reviews stay with the right talks.`);
  }

  const col = db.collection('submissions');
  const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [
    ...plan.upserts.map(s => (b: FirebaseFirestore.WriteBatch) =>
      b.set(col.doc(s.id), { ...s, removedFromSheet: false, syncedAt: at })),
    ...plan.markRemoved.map(id => (b: FirebaseFirestore.WriteBatch) =>
      b.update(col.doc(id), { removedFromSheet: true })),
  ];
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_SIZE).forEach(w => w(batch));
    await batch.commit();
  }

  const result: SyncResult = {
    added: plan.added, updated: plan.updated, removed: plan.markRemoved.length,
    total: submissions.length, missingColumns,
  };
  // merge keeps lastErrorAt, which only failures write
  await db.doc('meta/sync').set({ ...result, lastSyncedAt: at, error: null }, { merge: true });
  return result;
}
