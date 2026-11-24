import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, getMetadata, ref, uploadBytes } from 'firebase/storage';

let testEnv: RulesTestEnvironment;
const read = (f: string) => readFileSync(fileURLToPath(new URL(`../../${f}`, import.meta.url)), 'utf8');

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-cfp',
    firestore: { rules: read('firestore.rules') },
    storage: { rules: read('storage.rules') },
  });
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [uid, role] of [['mem1', 'member'], ['adm1', 'admin'], ['wait1', 'waiting'], ['rem1', 'removed']]) {
      await setDoc(doc(db, `users/${uid}`), {
        email: `${uid}@example.com`, name: uid, photoURL: '', role, createdAt: new Date(),
      });
    }
    await uploadBytes(ref(ctx.storage(), 'emailAttachments/t1/a.pdf'), new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' });
    await uploadBytes(ref(ctx.storage(), 'emailImages/seed.png'), new Uint8Array([1, 2, 3]), { contentType: 'image/png' });
    await uploadBytes(ref(ctx.storage(), 'emailImages/del.png'), new Uint8Array([1, 2, 3]), { contentType: 'image/png' });
    await uploadBytes(ref(ctx.storage(), 'photos/x'), new Uint8Array([1, 2, 3]), { contentType: 'image/png' });
  });
});

afterAll(async () => { await testEnv.cleanup(); });

const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com` }).storage();
const photo = (s: ReturnType<typeof as>) => ref(s, 'photos/x');

describe('storage rules', () => {
  it('lets a member and an admin read a photo', async () => {
    await assertSucceeds(getBytes(photo(as('mem1'))));
    await assertSucceeds(getBytes(photo(as('adm1'))));
  });
  it('denies a waiting user and a signed-out user', async () => {
    await assertFails(getBytes(photo(as('wait1'))));
    await assertFails(getBytes(photo(testEnv.unauthenticatedContext().storage())));
  });
  it('denies every client write, even for an admin', async () => {
    for (const uid of ['mem1', 'adm1']) {
      await assertFails(uploadBytes(ref(as(uid), 'photos/new'), new Uint8Array([1])));
      await assertFails(uploadBytes(photo(as(uid)), new Uint8Array([1])));
    }
  });
});

describe('email attachment rules', () => {
  const att = (s: ReturnType<typeof as>, f = 'a.pdf') => ref(s, `emailAttachments/t1/${f}`);
  const signedOut = () => testEnv.unauthenticatedContext().storage();
  it('lets a member and an admin read', async () => {
    await assertSucceeds(getBytes(att(as('mem1'))));
    await assertSucceeds(getBytes(att(as('adm1'))));
  });
  it('denies waiting and signed-out reads', async () => {
    await assertFails(getBytes(att(as('wait1'))));
    await assertFails(getBytes(att(as('rem1'))));
    await assertFails(getBytes(att(signedOut())));
  });
  it('lets an admin upload under 20 MB', async () => {
    await assertSucceeds(uploadBytes(att(as('adm1'), 'b.pdf'), new Uint8Array([1, 2])));
  });
  it('denies an admin upload of 20 MB or more', async () => {
    await assertFails(uploadBytes(att(as('adm1'), 'big.bin'), new Uint8Array(20 * 1024 * 1024)));
  });
  it('denies member, waiting and signed-out uploads', async () => {
    await assertFails(uploadBytes(att(as('mem1'), 'c.pdf'), new Uint8Array([1])));
    await assertFails(uploadBytes(att(as('wait1'), 'c.pdf'), new Uint8Array([1])));
    await assertFails(uploadBytes(att(as('rem1'), 'c.pdf'), new Uint8Array([1])));
    await assertFails(uploadBytes(att(signedOut(), 'c.pdf'), new Uint8Array([1])));
  });
  it('lets only an admin delete', async () => {
    await assertFails(deleteObject(att(as('mem1'))));
    await assertFails(deleteObject(att(as('wait1'))));
    await assertFails(deleteObject(att(as('rem1'))));
    await assertFails(deleteObject(att(signedOut())));
    await assertSucceeds(deleteObject(att(as('adm1'))));
  });
});

describe('email image rules', () => {
  const img = (s: ReturnType<typeof as>, f = 'seed.png') => ref(s, `emailImages/${f}`);
  const png = { contentType: 'image/png' };
  it('lets an admin upload a small image', async () => {
    await assertSucceeds(uploadBytes(img(as('adm1'), 'ok.png'), new Uint8Array(1024), png));
  });
  it('denies an admin upload that is not an image', async () => {
    await assertFails(uploadBytes(img(as('adm1'), 'page.html'), new Uint8Array(1024), { contentType: 'text/html' }));
  });
  it('denies an admin upload of 5 MB or more', async () => {
    await assertFails(uploadBytes(img(as('adm1'), 'big.png'), new Uint8Array(6 * 1024 * 1024), png));
  });
  it('denies a member upload', async () => {
    await assertFails(uploadBytes(img(as('mem1'), 'm.png'), new Uint8Array(1024), png));
  });
  it('lets only an admin read, which getDownloadURL needs', async () => {
    await assertSucceeds(getBytes(img(as('adm1'))));
    await assertSucceeds(getMetadata(img(as('adm1'))));
    await assertFails(getBytes(img(as('mem1'))));
    await assertFails(getMetadata(img(as('mem1'))));
    await assertFails(getBytes(img(testEnv.unauthenticatedContext().storage())));
  });
  it('lets only an admin delete', async () => {
    await assertFails(deleteObject(img(as('mem1'), 'del.png')));
    await assertSucceeds(deleteObject(img(as('adm1'), 'del.png')));
  });
});
