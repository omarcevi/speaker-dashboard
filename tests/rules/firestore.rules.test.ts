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
    await setDoc(doc(db, 'meta/advocu'), { total: 1 });
    await setDoc(doc(db, 'meta/event'), { fields: [] });
    await setDoc(doc(db, 'meta/stages'), { stages: [] });
    await setDoc(doc(db, 'speakerStages/ada@example.com'), { skipped: [], added: [] });
    await setDoc(doc(db, 'templates/t1'), { name: 'Welcome', subject: 'Hi', body: 'Hello', attachments: [], rule: 'anyone', stageId: null });
    await setDoc(doc(db, 'emails/e1'), { subject: 'Hi' });
    await setDoc(doc(db, 'threads/th1'), { subject: 'Hi' });
    await setDoc(doc(db, 'threads/th1/messages/m1'), { text: 'Hi' });
    await setDoc(doc(db, 'ai/row-2'), { sourceHash: 'h', overview: null, neighbors: [], error: null });
    await setDoc(doc(db, 'aiVectors/row-2'), { vector: [0.1, 0.2], sourceHash: 'h' });
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
  it('cannot read meta/advocu', async () => {
    await assertFails(getDoc(doc(as('wait1'), 'meta/advocu')));
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
  it('can read meta/advocu', async () => {
    await assertSucceeds(getDoc(doc(as('mem1'), 'meta/advocu')));
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

describe('admin meta', () => {
  it('cannot write meta/advocu', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/advocu'), { total: 2 }));
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

describe('ai results', () => {
  it('member can read ai/row-2', async () => {
    await assertSucceeds(getDoc(doc(as('mem1'), 'ai/row-2')));
  });
  it('member can list ai', async () => {
    await assertSucceeds(getDocs(collection(as('mem1'), 'ai')));
  });
  it('waiting user cannot read ai/row-2', async () => {
    await assertFails(getDoc(doc(as('wait1'), 'ai/row-2')));
  });
  it('signed out cannot read ai/row-2', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'ai/row-2')));
  });
  it('member cannot write ai/row-2', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'ai/row-2'), { sourceHash: 'x', overview: null, neighbors: [], error: null }));
  });
  it('admin cannot write ai/row-2', async () => {
    await assertFails(updateDoc(doc(as('adm1'), 'ai/row-2'), { error: 'x' }));
  });
  for (const uid of ['mem1', 'adm1']) {
    it(`${uid} cannot read aiVectors/row-2`, async () => {
      await assertFails(getDoc(doc(as(uid), 'aiVectors/row-2')));
    });
    it(`${uid} cannot list aiVectors`, async () => {
      await assertFails(getDocs(collection(as(uid), 'aiVectors')));
    });
    it(`${uid} cannot write aiVectors/row-2`, async () => {
      await assertFails(setDoc(doc(as(uid), 'aiVectors/row-2'), { vector: [1], sourceHash: 'x' }));
    });
    it(`${uid} cannot delete aiVectors/row-2`, async () => {
      await assertFails(deleteDoc(doc(as(uid), 'aiVectors/row-2')));
    });
  }
});

describe('templates', () => {
  const tpl = (extra: object = {}) => ({
    name: 'Accepted', subject: 'Welcome', body: 'Hello there', attachments: [], rule: 'anyone', stageId: null,
    updatedAt: serverTimestamp(), updatedBy: 'adm1', updatedByName: 'Adele', ...extra,
  });
  const readers: [string, boolean][] = [['mem1', true], ['adm1', true], ['wait1', false], ['rem1', false]];
  for (const [uid, ok] of readers) {
    it(`${uid} ${ok ? 'can' : 'cannot'} read templates/t1`, async () => {
      const p = getDoc(doc(as(uid), 'templates/t1'));
      await (ok ? assertSucceeds(p) : assertFails(p));
    });
  }
  it('signed out cannot read templates/t1', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'templates/t1')));
  });
  it('admin can create a template', async () => {
    await assertSucceeds(setDoc(doc(as('adm1'), 'templates/t2'), tpl()));
  });
  it('admin can set a string stageId and up to 10 attachments', async () => {
    await assertSucceeds(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ stageId: 's1', attachments: Array.from({ length: 10 }, (_, i) => ({ name: `f${i}` })) })));
  });
  it('admin can delete a template', async () => {
    await assertSucceeds(deleteDoc(doc(as('adm1'), 'templates/t1')));
  });
  it('member cannot write a template', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'templates/t2'), tpl({ updatedBy: 'mem1', updatedByName: 'Mo' })));
  });
  it('member cannot delete a template', async () => {
    await assertFails(deleteDoc(doc(as('mem1'), 'templates/t1')));
  });
  for (const uid of ['wait1', 'rem1']) {
    it(`${uid} cannot write a template`, async () => {
      await assertFails(setDoc(doc(as(uid), 'templates/t2'), tpl({ updatedBy: uid, updatedByName: NAMES[uid] })));
    });
  }
  for (const uid of ['wait1', 'rem1']) {
    it(`${uid} cannot update or delete the existing template t1`, async () => {
      await assertFails(setDoc(doc(as(uid), 'templates/t1'), tpl({ updatedBy: uid, updatedByName: NAMES[uid] })));
      await assertFails(deleteDoc(doc(as(uid), 'templates/t1')));
    });
  }
  it('signed out cannot write a template', async () => {
    await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), 'templates/t2'), tpl()));
  });
  it('admin cannot set updatedByName to someone else', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ updatedByName: 'Mo' })));
  });
  it('admin cannot set updatedBy to someone else', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ updatedBy: 'mem1' })));
  });
  it('admin cannot use a client updatedAt', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ updatedAt: new Date() })));
  });
  it('admin cannot add an extra key', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ extra: 1 })));
  });
  it('admin cannot use an unknown rule', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ rule: 'bogus' })));
  });
  it('admin cannot set an empty name or subject', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ name: '' })));
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ subject: '' })));
  });
  it('admin cannot set a body over 50,000 chars', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ body: 'x'.repeat(50001) })));
    await assertSucceeds(setDoc(doc(as('adm1'), 'templates/t3'), tpl({ body: 'x'.repeat(50000) })));
  });
  it('admin cannot set a numeric stageId', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ stageId: 3 })));
  });
  it('admin cannot set more than 10 attachments or a non-list', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ attachments: Array.from({ length: 11 }, (_, i) => ({ name: `f${i}` })) })));
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ attachments: 'x' })));
  });
  it('admin can set html as a string up to 200,000 chars or null', async () => {
    await assertSucceeds(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ html: '<p>Hello there</p>' })));
    await assertSucceeds(setDoc(doc(as('adm1'), 'templates/t3'), tpl({ html: null })));
    await assertSucceeds(setDoc(doc(as('adm1'), 'templates/t4'), tpl({ html: 'x'.repeat(200000) })));
  });
  it('admin cannot set a non-string html or one over 200,000 chars', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ html: 3 })));
    await assertFails(setDoc(doc(as('adm1'), 'templates/t2'), tpl({ html: 'x'.repeat(200001) })));
  });
});

describe('meta/event', () => {
  const ev = (extra: object = {}) => ({
    fields: [{ key: 'venue' }], updatedAt: serverTimestamp(), updatedBy: 'adm1', updatedByName: 'Adele', ...extra,
  });
  it('member can read meta/event', async () => {
    await assertSucceeds(getDoc(doc(as('mem1'), 'meta/event')));
  });
  it('waiting and removed users cannot read meta/event', async () => {
    await assertFails(getDoc(doc(as('wait1'), 'meta/event')));
    await assertFails(getDoc(doc(as('rem1'), 'meta/event')));
  });
  it('signed out cannot read or write meta/event', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'meta/event')));
    await assertFails(setDoc(doc(db, 'meta/event'), ev()));
  });
  it('admin can write meta/event', async () => {
    await assertSucceeds(setDoc(doc(as('adm1'), 'meta/event'), ev()));
  });
  it('member, waiting and removed users cannot write meta/event', async () => {
    for (const uid of ['mem1', 'wait1', 'rem1']) {
      await assertFails(setDoc(doc(as(uid), 'meta/event'), ev({ updatedBy: uid, updatedByName: NAMES[uid] })));
    }
  });
  it('admin cannot set another updatedByName', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/event'), ev({ updatedByName: 'Mo' })));
  });
  it('admin cannot add an extra key', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/event'), ev({ extra: 1 })));
  });
  it('admin cannot write more than 50 fields or a non-list', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/event'), ev({ fields: Array.from({ length: 51 }, (_, i) => ({ key: `k${i}` })) })));
    await assertFails(setDoc(doc(as('adm1'), 'meta/event'), ev({ fields: 'x' })));
  });
  it('admin can set a signatureHtml string up to 50,000 chars', async () => {
    await assertSucceeds(setDoc(doc(as('adm1'), 'meta/event'), ev({ signatureHtml: '<p>The team</p>' })));
    await assertSucceeds(setDoc(doc(as('adm1'), 'meta/event'), ev({ signatureHtml: 'x'.repeat(50000) })));
  });
  it('admin cannot set a non-string signatureHtml or one over 50,000 chars', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/event'), ev({ signatureHtml: null })));
    await assertFails(setDoc(doc(as('adm1'), 'meta/event'), ev({ signatureHtml: 'x'.repeat(50001) })));
  });
  it('admin can set speakerFacts up to 20,000 chars, and saves without it still work', async () => {
    await assertSucceeds(setDoc(doc(as('adm1'), 'meta/event'), ev({ speakerFacts: 'x'.repeat(20000) })));
    await assertSucceeds(setDoc(doc(as('adm1'), 'meta/event'), ev()));
  });
  it('admin cannot set a non-string speakerFacts or one over 20,000 chars', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/event'), ev({ speakerFacts: 'x'.repeat(20001) })));
    await assertFails(setDoc(doc(as('adm1'), 'meta/event'), ev({ speakerFacts: 5 })));
    await assertFails(setDoc(doc(as('adm1'), 'meta/event'), ev({ speakerFacts: null })));
  });
  it('admin still cannot write meta/sync or meta/other', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/sync'), { at: 2 }));
    await assertFails(setDoc(doc(as('adm1'), 'meta/other'), ev()));
  });
});

describe('meta/stages', () => {
  const st = (extra: object = {}) => ({
    stages: [{ id: 's1', name: 'Invite', templateIds: ['t1'], dueFrom: null, appliesTo: 'everyone' }],
    updatedAt: serverTimestamp(), updatedBy: 'adm1', updatedByName: 'Adele', ...extra,
  });
  it('member can read meta/stages', async () => {
    await assertSucceeds(getDoc(doc(as('mem1'), 'meta/stages')));
  });
  it('waiting, removed and signed out cannot read meta/stages', async () => {
    await assertFails(getDoc(doc(as('wait1'), 'meta/stages')));
    await assertFails(getDoc(doc(as('rem1'), 'meta/stages')));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'meta/stages')));
  });
  it('admin can write a valid meta/stages', async () => {
    await assertSucceeds(setDoc(doc(as('adm1'), 'meta/stages'), st()));
  });
  it('admin cannot add an extra key', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/stages'), st({ x: 1 })));
  });
  it('admin cannot write a non-list or more than 30 stages', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/stages'), st({ stages: 'a' })));
    await assertFails(setDoc(doc(as('adm1'), 'meta/stages'), st({ stages: Array.from({ length: 31 }, (_, i) => ({ id: `s${i}` })) })));
  });
  it('admin cannot set another updatedByName', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/stages'), st({ updatedByName: 'Someone' })));
  });
  it('member cannot write meta/stages', async () => {
    await assertFails(setDoc(doc(as('mem1'), 'meta/stages'), st({ updatedBy: 'mem1', updatedByName: 'Mo' })));
  });
  it('admin still cannot write meta/sync', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'meta/sync'), { at: 2 }));
  });
});

describe('speakerStages', () => {
  const ss = (extra: object = {}) => ({
    skipped: ['s1'], added: [], updatedAt: serverTimestamp(), updatedBy: 'adm1', updatedByName: 'Adele', ...extra,
  });
  const path = 'speakerStages/ada@example.com';
  it('member can read, waiting cannot', async () => {
    await assertSucceeds(getDoc(doc(as('mem1'), path)));
    await assertFails(getDoc(doc(as('wait1'), path)));
  });
  it('admin can write a valid doc', async () => {
    await assertSucceeds(setDoc(doc(as('adm1'), path), ss()));
  });
  it('admin cannot omit added or write non-lists', async () => {
    const { added, ...noAdded } = ss();
    await assertFails(setDoc(doc(as('adm1'), path), noAdded));
    await assertFails(setDoc(doc(as('adm1'), path), ss({ skipped: 's1' })));
  });
  it('admin cannot write more than 50 entries', async () => {
    await assertFails(setDoc(doc(as('adm1'), path), ss({ skipped: Array.from({ length: 51 }, (_, i) => `s${i}`) })));
  });
  it('member cannot write', async () => {
    await assertFails(setDoc(doc(as('mem1'), path), ss({ updatedBy: 'mem1', updatedByName: 'Mo' })));
  });
  it('admin cannot delete', async () => {
    await assertFails(deleteDoc(doc(as('adm1'), path)));
  });
});

describe('emails and threads', () => {
  const paths = ['emails/e1', 'threads/th1', 'threads/th1/messages/m1'];
  for (const p of paths) {
    it(`member and admin can read ${p}`, async () => {
      await assertSucceeds(getDoc(doc(as('mem1'), p)));
      await assertSucceeds(getDoc(doc(as('adm1'), p)));
    });
    it(`waiting, removed and signed-out cannot read ${p}`, async () => {
      await assertFails(getDoc(doc(as('wait1'), p)));
      await assertFails(getDoc(doc(as('rem1'), p)));
      await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), p)));
    });
    it(`nobody can write or delete ${p}`, async () => {
      for (const uid of ['mem1', 'adm1', 'wait1', 'rem1']) {
        await assertFails(setDoc(doc(as(uid), p), { x: 1 }));
        await assertFails(deleteDoc(doc(as(uid), p)));
      }
      await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), p), { x: 1 }));
    });
  }
  it('nobody can create a new email', async () => {
    await assertFails(setDoc(doc(as('adm1'), 'emails/new'), { subject: 'x' }));
  });
  describe('settling a reply', () => {
    const settled = (extra: object = {}) => ({
      messageId: 'm1', by: 'adm1', byName: 'Adele', at: serverTimestamp(), ...extra,
    });
    const th = (uid: string) => doc(as(uid), 'threads/th1');
    it('admin can settle and undo', async () => {
      await assertSucceeds(updateDoc(th('adm1'), { settled: settled() }));
      await assertSucceeds(updateDoc(th('adm1'), { settled: null }));
    });
    it('admin cannot change any other thread field', async () => {
      await assertFails(updateDoc(th('adm1'), { subject: 'Changed' }));
      await assertFails(updateDoc(th('adm1'), { settled: settled(), subject: 'Changed' }));
    });
    it('admin cannot settle as ai, as another uid, or with a bad shape', async () => {
      await assertFails(updateDoc(th('adm1'), { settled: settled({ by: 'ai' }) }));
      await assertFails(updateDoc(th('adm1'), { settled: settled({ by: 'mem1' }) }));
      await assertFails(updateDoc(th('adm1'), { settled: settled({ byName: 'Mo' }) }));
      await assertFails(updateDoc(th('adm1'), { settled: settled({ at: new Date() }) }));
      await assertFails(updateDoc(th('adm1'), { settled: settled({ messageId: '' }) }));
      await assertFails(updateDoc(th('adm1'), { settled: settled({ messageId: 'x'.repeat(201) }) }));
      await assertFails(updateDoc(th('adm1'), { settled: settled({ extra: 1 }) }));
      await assertFails(updateDoc(th('adm1'), { settled: 'yes' }));
    });
    it('members and others cannot settle or undo', async () => {
      for (const uid of ['mem1', 'wait1', 'rem1']) {
        await assertFails(updateDoc(th(uid), { settled: settled({ by: uid, byName: NAMES[uid] }) }));
        await assertFails(updateDoc(th(uid), { settled: null }));
      }
    });
    it('admin cannot create or delete threads', async () => {
      await assertFails(setDoc(doc(as('adm1'), 'threads/new'), { settled: settled() }));
      await assertFails(deleteDoc(th('adm1')));
    });
  });
  it('members can list emails and threads', async () => {
    await assertSucceeds(getDocs(collection(as('mem1'), 'emails')));
    await assertSucceeds(getDocs(collection(as('mem1'), 'threads')));
  });
});
