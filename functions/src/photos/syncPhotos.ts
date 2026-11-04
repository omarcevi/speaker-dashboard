import type { SubmissionData } from '../model.js';

export interface PhotoDeps {
  exists(path: string): Promise<boolean>;
  download(fileId: string): Promise<{ data: Buffer; contentType: string }>;
  save(path: string, data: Buffer, contentType: string): Promise<void>;
}
export interface PhotoResult { copied: number; skipped: number; failed: string[] }

const MAX_BYTES = 10 * 1024 * 1024;
const CONCURRENCY = 5;
// File ids come from untrusted sheet data and become Storage paths.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Copies each distinct Drive photo to Storage `photos/{fileId}`. One bad photo never stops the others. */
export async function syncPhotos(subs: SubmissionData[], deps: PhotoDeps): Promise<PhotoResult> {
  const ids = [...new Set(subs.map(s => s.photoFileId).filter((id): id is string => !!id))];
  const result: PhotoResult = { copied: 0, skipped: 0, failed: [] };
  const queue: string[] = [];
  for (const id of ids) (SAFE_ID.test(id) ? queue : result.failed).push(id);

  async function copyOne(id: string): Promise<void> {
    try {
      const path = `photos/${id}`;
      if (await deps.exists(path)) { result.skipped++; return; }
      const { data, contentType } = await deps.download(id);
      if (!contentType.startsWith('image/') || data.length > MAX_BYTES) { result.failed.push(id); return; }
      await deps.save(path, data, contentType);
      result.copied++;
    } catch {
      result.failed.push(id);
    }
  }

  async function worker(): Promise<void> {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) await copyOne(id);
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return result;
}
