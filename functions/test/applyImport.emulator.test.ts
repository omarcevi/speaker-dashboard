import { describe, it, expect, beforeEach } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { applySync } from '../src/sync/applySync.js';
import { applyImport } from '../src/advocu/applyImport.js';
import { ImportRefused } from '../src/advocu/parseAdvocu.js';
import { fakeSheet } from '../src/testing/fakeRows.js';
import { fakeAdvocuCsv, FAKE_ADVOCU_ROWS } from '../src/testing/fakeAdvocu.js';

const db = getFirestore(initializeApp({ projectId: 'demo-cfp' }));
const by = { uid: 'adm1', name: 'Adele' };

async function advocuDocs() {
  const snap = await db.collection('submissions').where('source', '==', 'advocu').get();
  return snap.docs;
}
async function snapshotOf(paths: string[]) {
  return Object.fromEntries(await Promise.all(paths.map(async p => [p, (await db.doc(p).get()).data()])));
}

describe('applyImport', () => {
  beforeEach(async () => {
    await Promise.all(['submissions', 'reviews', 'scores', 'comments', 'meta']
      .map(c => db.recursiveDelete(db.collection(c))));
    await applySync(db, fakeSheet());
  });

  it('preview writes nothing', async () => {
    const before = (await db.collection('submissions').get()).size;
    const r = await applyImport(db, fakeAdvocuCsv(), { apply: false, by });
    expect(r.mode).toBe('preview');
    expect(r.added).toBe(FAKE_ADVOCU_ROWS.length);
    expect((await db.collection('submissions').get()).size).toBe(before);
    expect((await db.doc('meta/advocu').get()).exists).toBe(false);
  });

  it('apply writes advocu docs and meta/advocu', async () => {
    const r = await applyImport(db, fakeAdvocuCsv(), { apply: true, by });
    expect(r.mode).toBe('apply');
    const docs = await advocuDocs();
    expect(docs.length).toBe(FAKE_ADVOCU_ROWS.length);
    docs.forEach(d => expect(d.data()).toMatchObject({ source: 'advocu', removedFromSheet: false }));
    expect((await db.doc('meta/advocu').get()).data()).toMatchObject({
      total: FAKE_ADVOCU_ROWS.length, added: FAKE_ADVOCU_ROWS.length, byName: 'Adele', error: null,
    });
  });

  it('refused file writes nothing', async () => {
    const before = (await db.collection('submissions').get()).size;
    await expect(applyImport(db, 'Timestamp,Email\r\n1,2\r\n', { apply: true, by })).rejects.toBeInstanceOf(ImportRefused);
    expect((await db.collection('submissions').get()).size).toBe(before);
    expect((await db.doc('meta/advocu').get()).exists).toBe(false);
  });

  it('hide then restore keeps reviews', async () => {
    await applyImport(db, fakeAdvocuCsv(), { apply: true, by });
    const id = (await advocuDocs()).find(d => d.get('title') === 'Fake Cloud Talk')!.id;
    await db.doc(`reviews/${id}`).set({ status: 'approved', updatedBy: 'u1' });
    await db.doc(`scores/${id}__u1`).set({ submissionId: id, uid: 'u1', value: 4 });
    await db.doc(`comments/c1`).set({ submissionId: id, uid: 'u1', text: 'hi' });
    const paths = [`reviews/${id}`, `scores/${id}__u1`, 'comments/c1'];
    const before = await snapshotOf(paths);
    const keep = FAKE_ADVOCU_ROWS.filter(r => r['Proposal title'] !== 'Fake Cloud Talk');
    const without = await applyImport(db, fakeAdvocuCsv(keep), { apply: true, by });
    expect(without.hidden).toBe(1);
    expect((await db.doc(`submissions/${id}`).get()).get('removedFromSheet')).toBe(true);
    expect(await snapshotOf(paths)).toEqual(before);
    await applyImport(db, fakeAdvocuCsv(), { apply: true, by });
    expect((await db.doc(`submissions/${id}`).get()).get('removedFromSheet')).toBe(false);
    expect(await snapshotOf(paths)).toEqual(before);
  });

  it('merge count sees the fake form talk', async () => {
    const r = await applyImport(db, fakeAdvocuCsv(), { apply: false, by });
    expect(r.merged).toBe(1);
  });
});
