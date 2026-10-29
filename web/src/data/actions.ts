import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import type { Status } from '../../../functions/src/model.ts'
import { db } from '../firebase.ts'

export interface Actor { uid: string; name: string }

export async function setScore(submissionId: string, value: 1 | 2 | 3 | 4 | 5 | null, me: Actor): Promise<void> {
  const ref = doc(db, 'scores', `${submissionId}__${me.uid}`)
  if (value === null) {
    await deleteDoc(ref)
    return
  }
  await setDoc(ref, { submissionId, uid: me.uid, name: me.name, value, updatedAt: serverTimestamp() })
}

export async function setStatus(submissionId: string, from: Status, to: Status, me: Actor): Promise<void> {
  if (from === to) return
  const batch = writeBatch(db)
  batch.set(doc(db, 'reviews', submissionId), {
    status: to,
    updatedAt: serverTimestamp(),
    updatedBy: me.uid,
    updatedByName: me.name,
  })
  batch.set(doc(collection(db, 'reviews', submissionId, 'history')), {
    from,
    to,
    by: me.uid,
    byName: me.name,
    at: serverTimestamp(),
  })
  await batch.commit()
}

export async function addComment(submissionId: string, text: string, me: Actor): Promise<void> {
  await addDoc(collection(db, 'comments'), {
    submissionId,
    uid: me.uid,
    name: me.name,
    text,
    createdAt: serverTimestamp(),
    editedAt: null,
  })
}

export async function editComment(commentId: string, text: string): Promise<void> {
  await updateDoc(doc(db, 'comments', commentId), { text, editedAt: serverTimestamp() })
}

export async function deleteComment(commentId: string): Promise<void> {
  await deleteDoc(doc(db, 'comments', commentId))
}
