import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

const NAMES: Record<string, string> = { adm1: 'Adele', mem1: 'Mo', wait1: 'Wes', rem1: 'Rae', new1: 'Nia' }
const emailOf = (uid: string) => `${uid}@example.com`

const userDoc = (role: string, uid = 'x') => ({
  email: emailOf(uid),
  name: NAMES[uid] ?? 'X',
  photoURL: '',
  role,
  createdAt: new Date(),
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-cfp',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/wait1'), userDoc('waiting', 'wait1'));
    await setDoc(doc(db, 'users/rem1'), userDoc('removed', 'rem1'));
    await setDoc(doc(db, 'users/mem1'), userDoc('member', 'mem1'));
    await setDoc(doc(db, 'users/adm1'), userDoc('admin', 'adm1'));
    await setDoc(doc(db, 'submissions/row-2'), { title: 'T' });
    await setDoc(doc(db, 'meta/sync'), { at: 1 });
    await setDoc(doc(db, 'scores/row-2__adm1'), {
      submissionId: 'row-2', uid: 'adm1', name: 'Adele', value: 5, updatedAt: new Date(),
    });
    await setDoc(doc(db, 'comments/c-adm'), {
      submissionId: 'row-2', uid: 'adm1', name: 'Adele', text: 'hi', createdAt: new Date(), editedAt: null,
    });
    await setDoc(doc(db, 'comments/c-mem'), {
      submissionId: 'row-2', uid: 'mem1', name: 'Mo', text: 'mine', createdAt: new Date(), editedAt: null,
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const as = (uid: string) => testEnv.authenticatedContext(uid, { email: emailOf(uid) }).firestore();
const score = (uid: string, value: unknown, extra: object = {}) => ({
  submissionId: 'row-2', uid, name: NAMES[uid], value, updatedAt: serverTimestamp(), ...extra,
});
const comment = (uid: string, text: string, extra: object = {}) => ({
  submissionId: 'row-2', uid, name: NAMES[uid], text, createdAt: serverTimestamp(), editedAt: null, ...extra,
});

describe('signed out', () => {
  it('cannot read submissions/row-2', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'submissions/row-2')));
  });
});

describe('waiting user', () => {
  it('cannot read submissions/row-2', async () => {
    await assertFails(getDoc(doc(as('wait1'), 'submissions/row-2')));
  });
  it('cannot read reviews/row-2', async () => {
    await assertFails(getDoc(doc(as('wait1'), 'reviews/row-2')));
  });
  it('cannot list scores', async () => {
    await assertFails(getDocs(collection(as('wait1'), 'scores')));
  });
  it('cannot list comments', async () => {
    await assertFails(getDocs(collection(as('wait1'), 'comments')));
  });
  it('cannot read meta/sync', async () => {
    await assertFails(getDoc(doc(as('wait1'), 'meta/sync')));
  });
  it('can read its own user doc', async () => {
    await assertSucceeds(getDoc(doc(as('wait1'), 'users/wait1')));
  });
  it('cannot read users/mem1', async () => {
    await assertFails(getDoc(doc(as('wait1'), 'users/mem1')));
  });
  it('cannot set its own role to member', async () => {
    await assertFails(updateDoc(doc(as('wait1'), 'users/wait1'), { role: 'member' }));
  });
  it('cannot write a score', async () => {
    await assertFails(setDoc(doc(as('wait1'), 'scores/row-2__wait1'), score('wait1', 3)));
  });
});

describe('new user', () => {
  it('can create its own doc as waiting', async () => {
    await assertSucceeds(setDoc(doc(as('new1'), 'users/new1'), userDoc('waiting', 'new1')));
  });
  it('cannot create its own doc as admin', async () => {
    await assertFails(setDoc(doc(as('new1'), 'users/new1'), userDoc('admin', 'new1')));
  });
  it('cannot create its own doc with an extra key', async () => {
    await assertFails(setDoc(doc(as('new1'), 'users/new1'), { ...userDoc('waiting', 'new1'), extra: 1 }));
  });
  it('cannot create users/other', async () => {
    await assertFails(setDoc(doc(as('new1'), 'users/other'), userDoc('waiting', 'new1')));
  });
  it('cannot create its own doc with an email that does not match the token', async () => {
    await assertFails(setDoc(doc(as('new1'), 'users/new1'), { ...userDoc('waiting', 'new1'), email: 'someone@else.com' }));
  });
});

describe('removed user', () => {
  it('cannot read submissions/row-2', async () => {
    await assertFails(getDoc(doc(as('rem1'), 'submissions/row-2')));
  });
});

describe('member', () => {
  it('can read submissions/row-2', async () => {
    await assertSucceeds(getDoc(doc(as('mem1'), 'submissions/row-2')));
  });
  it('cannot write submissions/row-2', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'submissions/row-2'), { title: 'x' }));
  });
  it('cannot write reviews/row-2', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'reviews/row-2'), { status: 'approved' }));
  });
  it('cannot write meta/sync', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'meta/sync'), { at: 2 }));
  });
});

describe('member scores', () => {
  it('can set its own score of 4', async () => {
    await assertSucceeds(setDoc(doc(as('mem1'), 'scores/row-2__mem1'), score('mem1', 4)));
  });
  it('cannot set value 0', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'scores/row-2__mem1'), score('mem1', 0)));
  });
  it('cannot set value 6', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'scores/row-2__mem1'), score('mem1', 6)));
  });
  it('cannot set value 3.5', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'scores/row-2__mem1'), score('mem1', 3.5)));
  });
  it('cannot set scores/row-2__adm1', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'scores/row-2__adm1'), score('mem1', 3)));
  });
  it('cannot set uid adm1 on its own doc id', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'scores/row-2__mem1'), score('adm1', 3)));
  });
  it("cannot delete another user's score", async () => {
    await assertFails(deleteDoc(doc(as('mem1'), 'scores/row-2__adm1')));
  });
});

describe('member comments', () => {
  it('can create its own comment', async () => {
    await assertSucceeds(setDoc(doc(as('mem1'), 'comments/new-c'), comment('mem1', 'hello')));
  });
  it('can edit its own comment', async () => {
    await assertSucceeds(updateDoc(doc(as('mem1'), 'comments/c-mem'), { text: 'edited', editedAt: serverTimestamp() }));
  });
  it('cannot post a score under another name', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'scores/row-2__mem1'), score('mem1', 4, { name: 'Adele' })));
  });
  it('cannot post a comment under another name', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'comments/spoof-n'), comment('mem1', 'hi', { name: 'Adele' })));
  });
  it('cannot post a comment with a client createdAt', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'comments/spoof-t'), comment('mem1', 'hi', { createdAt: new Date() })));
  });
  it('cannot post a comment with an extra key', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'comments/spoof-k'), comment('mem1', 'hi', { extra: 1 })));
  });
  it('cannot create a comment as adm1', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'comments/bad-c'), comment('adm1', 'hello')));
  });
  it('cannot create an empty comment', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'comments/empty-c'), comment('mem1', '')));
  });
  it("cannot edit adm1's comment", async () => {
    await assertFails(updateDoc(doc(as('mem1'), 'comments/c-adm'), { text: 'hacked', editedAt: serverTimestamp() }));
  });
  it('cannot change the uid of its own comment', async () => {
    await assertFails(updateDoc(doc(as('mem1'), 'comments/c-mem'), { uid: 'adm1' }));
  });
  it('can delete its own comment', async () => {
    await assertSucceeds(deleteDoc(doc(as('mem1'), 'comments/c-mem')));
  });
});

describe('admin', () => {
  const review = (extra: object = {}) => ({
    status: 'approved', updatedAt: serverTimestamp(), updatedBy: 'adm1', updatedByName: 'Adele', ...extra,
  });
  const hist = (extra: object = {}) => ({
    from: 'pending', to: 'approved', by: 'adm1', byName: 'Adele', at: serverTimestamp(), ...extra,
  });
  it('can set review status approved', async () => {
    await assertSucceeds(setDoc(doc(as('adm1'), 'reviews/row-2'), review()));
  });
  it('cannot set review status accepted', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'reviews/row-2'), review({ status: 'accepted' })));
  });
  it('cannot set a review with another updatedBy', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'reviews/row-2'), review({ updatedBy: 'mem1' })));
  });
  it('cannot set a review with another updatedByName', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'reviews/row-2'), review({ updatedByName: 'Mo' })));
  });
  it('can create a history entry', async () => {
    await assertSucceeds(setDoc(doc(as('adm1'), 'reviews/row-2/history/h1'), hist()));
  });
  it('cannot create a history entry with another by', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'reviews/row-2/history/h3'), hist({ by: 'mem1' })));
  });
  it('cannot create a history entry with a client at', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'reviews/row-2/history/h4'), hist({ at: new Date() })));
  });
  it("cannot create a history entry with to: 'accepted'", async () => {
    await assertFails(setDoc(doc(as('adm1'), 'reviews/row-2/history/h5'), hist({ to: 'accepted' })));
  });
  it('member cannot create a history entry', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'reviews/row-2/history/h2'), hist()));
  });
});

describe('admin roles', () => {
  it("can update users/mem1.role to admin", async () => {
    await assertSucceeds(updateDoc(doc(as('adm1'), 'users/mem1'), { role: 'admin' }));
  });
  it('cannot update users/mem1.role to superadmin', async () => {
    await assertFails(updateDoc(doc(as('adm1'), 'users/mem1'), { role: 'superadmin' }));
  });
  it('cannot update its own role to member', async () => {
    await assertFails(updateDoc(doc(as('adm1'), 'users/adm1'), { role: 'member' }));
  });
});
