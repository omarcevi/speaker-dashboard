import { describe, it, expect, beforeEach } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { applySync } from '../src/sync/applySync.js';
import { applyImport } from '../src/advocu/applyImport.js';
import { fakeAdvocuCsv } from '../src/testing/fakeAdvocu.js';
import { HEADER_ROW, makeRow, fakeSheet } from '../src/testing/fakeRows.js';

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

  it('pauses and writes nothing when rows moved', async () => {
    const sheet = fakeSheet();
    await applySync(db, sheet);
    await db.doc('reviews/row-2').set({ status: 'approved', updatedBy: 'u1' });
    const before = await snapshotOf(['submissions/row-2', 'submissions/row-3', 'reviews/row-2']);
    const swapped = [sheet[0], sheet[2], sheet[1], ...sheet.slice(3)];
    await expect(applySync(db, swapped)).rejects.toThrow('Rows moved');
    expect(await snapshotOf(['submissions/row-2', 'submissions/row-3', 'reviews/row-2'])).toEqual(before);
  });

  it('refuses to sync when a required column is missing and writes nothing', async () => {
    const noEmail = HEADER_ROW.filter(h => h !== 'Email');
    const emailIdx = HEADER_ROW.indexOf('Email');
    const row = makeRow().filter((_, i) => i !== emailIdx);
    await expect(applySync(db, [noEmail, row])).rejects.toThrow('Required columns missing from the sheet: email');
    expect((await db.collection('submissions').get()).size).toBe(0);
    expect((await db.doc('meta/sync').get()).exists).toBe(false);
  });

  it('sheet sync ignores advocu docs', async () => {
    await applyImport(db, fakeAdvocuCsv(), { apply: true, by: { uid: 'adm1', name: 'Adele' } });
    await applySync(db, fakeSheet());
    const r = await applySync(db, fakeSheet());
    expect(r.removed).toBe(0);
    const docs = (await db.collection('submissions').where('source', '==', 'advocu').get()).docs;
    expect(docs.length).toBeGreaterThan(0);
    docs.forEach(d => expect(d.get('removedFromSheet')).toBe(false));
  });
});
