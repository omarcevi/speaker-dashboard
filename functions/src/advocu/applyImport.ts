import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { ImportSummary } from '../model.js';
import { ImportRefused, parseAdvocu } from './parseAdvocu.js';
import { planImport, type StoredDoc } from './planImport.js';

const BATCH_SIZE = 450;

/**
 * Parses an Advocu export and, when `apply` is set, upserts Advocu submissions and writes `meta/advocu`.
 * Only parsed fields are written; the raw CSV is never stored or logged.
 */
export async function applyImport(
  db: Firestore,
  csv: string,
  opts: { apply: boolean; by: { uid: string; name: string }; now?: Date },
): Promise<ImportSummary> {
  const at = Timestamp.fromDate(opts.now ?? new Date());
  try {
    const { applications, cfpTitles, rejected } = parseAdvocu(csv);

    const snap = await db.collection('submissions')
      .select('source', 'contentHash', 'removedFromSheet', 'speakerKey', 'title').get();
    const stored: StoredDoc[] = snap.docs.map(d => ({
      id: d.id,
      source: d.get('source') === 'advocu' ? 'advocu' : 'form',
      contentHash: d.get('contentHash') as string,
      removedFromSheet: d.get('removedFromSheet') === true,
      speakerKey: (d.get('speakerKey') as string | undefined) ?? '',
      title: (d.get('title') as string | undefined) ?? '',
    }));
    const plan = planImport(applications, stored, cfpTitles);
    const summary: ImportSummary = {
      mode: opts.apply ? 'apply' : 'preview', ...plan.counts, cfpTitles, rejected,
    };
    if (!opts.apply) return summary;

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
    await db.doc('meta/advocu').set({
      lastImportAt: at, byName: opts.by.name, total: summary.total, added: summary.added,
      updated: summary.updated, hidden: summary.hidden, error: null,
    }, { merge: true });
    return summary;
  } catch (e) {
    if (e instanceof ImportRefused) throw e;
    await db.doc('meta/advocu').set({
      error: e instanceof Error ? e.message : String(e), lastErrorAt: at,
    }, { merge: true });
    throw e;
  }
}
