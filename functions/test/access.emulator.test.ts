import { describe, it, expect, beforeEach } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { requireRole } from '../src/access.js';
import type { Role } from '../src/model.js';

getApps().length || initializeApp({ projectId: 'demo-cfp' });
const db = getFirestore();

async function putUser(uid: string, role: Role) {
  await db.doc(`users/${uid}`).set({ email: `${uid}@example.com`, name: uid, photoURL: '', role, createdAt: Timestamp.now() });
}

describe('requireRole', () => {
  beforeEach(async () => {
    await db.recursiveDelete(db.collection('users'));
  });

  it('rejects a missing uid as unauthenticated', async () => {
    await expect(requireRole(undefined, ['member', 'admin'])).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects a uid with no user doc', async () => {
    await expect(requireRole('ghost', ['member', 'admin'])).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it.each(['waiting', 'removed'] as const)('rejects a %s user', async role => {
    await putUser('u1', role);
    await expect(requireRole('u1', ['member', 'admin'])).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('resolves with the doc for an allowed role', async () => {
    await putUser('u1', 'member');
    await expect(requireRole('u1', ['member', 'admin'])).resolves.toMatchObject({ role: 'member', email: 'u1@example.com' });
  });

  it('rejects a member when only admin is allowed', async () => {
    await putUser('u1', 'member');
    await expect(requireRole('u1', ['admin'])).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
