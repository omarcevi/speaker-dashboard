import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { runSync } from '../src/sync/runSync.js';
import { fakeSheet, HEADER_ROW } from '../src/testing/fakeRows.js';

getApps().length || initializeApp({ projectId: 'demo-cfp' });
const db = getFirestore();
const t1 = new Date('2026-10-01T10:00:00Z');
const t2 = new Date('2026-10-01T10:15:00Z');
const failing = (msg: string) => async (): Promise<string[][]> => { throw new Error(msg); };

describe('runSync', () => {
  beforeEach(async () => {
    await Promise.all(['submissions', 'meta'].map(c => db.recursiveDelete(db.collection(c))));
  });

  it('records the error, keeps lastSyncedAt, rethrows, then clears the error on the next success', async () => {
    await runSync(db, async () => fakeSheet(), { now: t1 });
    await expect(runSync(db, failing('403 caller does not have permission'), { now: t2 })).rejects.toThrow('403');
    const failed = (await db.doc('meta/sync').get()).data()!;
    expect(failed.error).toContain('403');
    expect(failed.lastSyncedAt).toEqual(Timestamp.fromDate(t1));
    expect(failed.lastErrorAt).toEqual(Timestamp.fromDate(t2));

    await runSync(db, async () => fakeSheet(), { now: new Date('2026-10-01T10:30:00Z') });
    expect((await db.doc('meta/sync').get()).get('error')).toBeNull();
  });

  it('treats a header-only sheet as an error and removes nothing', async () => {
    await runSync(db, async () => fakeSheet(), { now: t1 });
    await expect(runSync(db, async () => [HEADER_ROW], { now: t2 })).rejects.toThrow('no rows');
    expect((await db.doc('meta/sync').get()).get('error')).toContain('no rows');
    const removed = await db.collection('submissions').where('removedFromSheet', '==', true).get();
    expect(removed.size).toBe(0);
  });

  it('passes parsed submissions to the photos hook after a successful sync', async () => {
    let got = 0;
    await runSync(db, async () => fakeSheet(), { now: t1, photos: async subs => { got = subs.length; } });
    expect(got).toBeGreaterThan(0);
  });

  it('does not fail the sync or set meta/sync.error when the photos hook throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runSync(db, async () => fakeSheet(), {
      now: t1, photos: async () => { throw new Error('drive down'); },
    })).resolves.toBeDefined();
    expect((await db.doc('meta/sync').get()).get('error')).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
