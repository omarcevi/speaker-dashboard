import { describe, it, expect, beforeEach } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { applySync } from '../src/sync/applySync.js';
import { HEADER_ROW, makeRow } from '../src/testing/fakeRows.js';

const db = getFirestore(initializeApp({ projectId: 'demo-cfp' }));

async function snapshotOf(paths: string[]) {
  return Object.fromEntries(await Promise.all(paths.map(async p => [p, (await db.doc(p).get()).data()])));
}

describe('applySync', () => {
  beforeEach(async () => {
    await Promise.all(['submissions', 'reviews', 'scores', 'comments', 'meta']
      .map(c => db.recursiveDelete(db.collection(c))));
  });

  it('edit updates the same submission and never touches review data', async () => {
    await applySync(db, [HEADER_ROW, makeRow({ title: 'Old' }), makeRow({ email: 'b@example.com' })]);
    await db.doc('reviews/row-2').set({ status: 'approved', updatedBy: 'u1' });
    await db.doc('scores/row-2__u1').set({ submissionId: 'row-2', uid: 'u1', value: 4 });
    await db.doc('comments/c1').set({ submissionId: 'row-2', uid: 'u1', text: 'hi' });
    const before = await snapshotOf(['reviews/row-2', 'scores/row-2__u1', 'comments/c1']);
    const r = await applySync(db, [HEADER_ROW, makeRow({ title: 'New', timestamp: 'later' })]);
    expect(await snapshotOf(['reviews/row-2', 'scores/row-2__u1', 'comments/c1'])).toEqual(before);
    expect((await db.doc('submissions/row-2').get()).data()).toMatchObject({ title: 'New', removedFromSheet: false });
    expect((await db.doc('submissions/row-3').get()).data()).toMatchObject({ removedFromSheet: true });
    expect((await db.collection('submissions').get()).size).toBe(2);
    expect(r).toMatchObject({ added: 0, updated: 1, removed: 1, total: 1 });
    expect((await db.doc('meta/sync').get()).data()).toMatchObject({ error: null, total: 1 });
  });
});
