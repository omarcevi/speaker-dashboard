import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import type { EmailTemplate, EventField, RecipientRule, Role, Status, TemplateAttachment } from '../../../functions/src/model.ts'
import { db, storage } from '../firebase.ts'

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

export async function setRole(uid: string, role: Role): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { role })
}

export type TemplateInput = Pick<EmailTemplate, 'name' | 'subject' | 'body' | 'attachments'> & { rule: RecipientRule }

// Creates with an auto id when `id` is null; returns the id. Templates are not tied to a stage yet.
export async function saveTemplate(id: string | null, t: TemplateInput, me: Actor): Promise<string> {
  const tref = id === null ? doc(collection(db, 'templates')) : doc(db, 'templates', id)
  await setDoc(tref, {
    name: t.name,
    subject: t.subject,
    body: t.body,
    attachments: t.attachments,
    rule: t.rule,
    stageId: null,
    updatedAt: serverTimestamp(),
    updatedBy: me.uid,
    updatedByName: me.name,
  })
  return tref.id
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, 'templates', id))
}

export async function uploadTemplateAttachment(templateId: string, file: File): Promise<TemplateAttachment> {
  const path = `emailAttachments/${templateId}/${Date.now()}-${file.name}`
  await uploadBytes(ref(storage, path), file, { contentType: file.type || 'application/octet-stream' })
  return { path, name: file.name, size: file.size, contentType: file.type || 'application/octet-stream' }
}

export async function saveEvent(fields: EventField[], me: Actor): Promise<void> {
  await setDoc(doc(db, 'meta', 'event'), { fields, updatedAt: serverTimestamp(), updatedBy: me.uid, updatedByName: me.name })
}
