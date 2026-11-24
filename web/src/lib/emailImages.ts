import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../firebase.ts'
import { safeFileName } from './emails.ts'

const MAX_BYTES = 5 * 1024 * 1024

export function emailImagePath(fileName: string, uuid: string): string {
  return `emailImages/${uuid}-${safeFileName(fileName)}`
}

/** User-facing reason a file can't be used as an email image, or null when it can. */
export function imageProblem(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith('image/')) return 'Images only'
  if (file.size >= MAX_BYTES) return 'Images must be under 5 MB'
  return null
}

/** Uploads to Storage and returns the download URL the email will link to. */
export async function uploadEmailImage(file: File): Promise<string> {
  const problem = imageProblem(file)
  if (problem) throw new Error(problem)
  const r = ref(storage, emailImagePath(file.name, crypto.randomUUID()))
  await uploadBytes(r, file, { contentType: file.type })
  return getDownloadURL(r)
}
