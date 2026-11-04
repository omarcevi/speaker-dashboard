import type { SubmissionData } from '../model.js';

export interface PhotoDeps {
  exists(path: string): Promise<boolean>;
  meta(fileId: string): Promise<{ mimeType: string; size: number }>;
  download(fileId: string): Promise<{ data: Buffer }>;
  save(path: string, data: Buffer, contentType: string): Promise<void>;
}
export interface PhotoResult { copied: number; skipped: number; failed: string[] }

const MAX_BYTES = 10 * 1024 * 1024;
const CONCURRENCY = 5;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// File ids come from untrusted sheet data and become Storage paths.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Identifies an allowed image type from its first bytes; Drive's declared type is never trusted. */
export function sniffImageType(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  const head6 = b.subarray(0, 6).toString('latin1');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Copies each distinct Drive photo to Storage `photos/{fileId}`. One bad photo never stops the others. */
export async function syncPhotos(subs: SubmissionData[], deps: PhotoDeps): Promise<PhotoResult> {
  const ids = [...new Set(subs.map(s => s.photoFileId).filter((id): id is string => !!id))];
  const result: PhotoResult = { copied: 0, skipped: 0, failed: [] };
  const queue: string[] = [];
  const reject = (id: string, reason: string) => {
    console.warn('Photo rejected', id, reason);
    result.failed.push(id);
  };
  for (const id of ids) {
    if (SAFE_ID.test(id)) queue.push(id); else reject(id, 'unsafe file id');
  }

  async function copyOne(id: string): Promise<void> {
    try {
      const path = `photos/${id}`;
      if (await deps.exists(path)) { result.skipped++; return; }
      const meta = await deps.meta(id);
      if (!ALLOWED.includes(meta.mimeType)) return reject(id, `type not allowed: ${meta.mimeType}`);
      if (!(meta.size <= MAX_BYTES)) return reject(id, `too large: ${meta.size}`);
      const { data } = await deps.download(id);
      if (data.length > MAX_BYTES) return reject(id, `too large: ${data.length}`);
      const type = sniffImageType(data);
      if (!type) return reject(id, 'content is not an allowed image');
      await deps.save(path, data, type);
      result.copied++;
    } catch (err) {
      console.error('Photo copy failed', id, err);
      result.failed.push(id);
    }
  }

  async function worker(): Promise<void> {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) await copyOne(id);
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return result;
}
