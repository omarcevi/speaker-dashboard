import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Role, UserDoc } from './model.js';

/** Returns the caller's user doc when their role is allowed; otherwise throws an HttpsError. */
export async function requireRole(uid: string | undefined, roles: Role[]): Promise<UserDoc> {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const snap = await getFirestore().doc(`users/${uid}`).get();
  const user = snap.data() as UserDoc | undefined;
  if (!user || !roles.includes(user.role)) throw new HttpsError('permission-denied', 'Not allowed.');
  return user;
}
