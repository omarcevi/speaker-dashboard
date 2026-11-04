import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

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
    for (const [uid, role] of [['mem1', 'member'], ['adm1', 'admin'], ['wait1', 'waiting']]) {
      await setDoc(doc(db, `users/${uid}`), {
        email: `${uid}@example.com`, name: uid, photoURL: '', role, createdAt: new Date(),
      });
    }
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
