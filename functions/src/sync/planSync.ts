import type { SubmissionData } from '../model.js';

export interface ExistingSubmission { id: string; contentHash: string; removedFromSheet: boolean }
export interface SyncPlan { upserts: SubmissionData[]; markRemoved: string[]; added: number; updated: number }

/** Pure diff of sheet rows against stored submissions. Rows are keyed by id, so an edit is an update, never an add. */
export function planSync(incoming: SubmissionData[], existing: ExistingSubmission[]): SyncPlan {
  const byId = new Map(existing.map(e => [e.id, e]));
  const incomingIds = new Set(incoming.map(s => s.id));
  const upserts: SubmissionData[] = [];
  let added = 0;
  let updated = 0;
  for (const s of incoming) {
    const prev = byId.get(s.id);
    if (!prev) { upserts.push(s); added++; }
    else if (prev.contentHash !== s.contentHash || prev.removedFromSheet) { upserts.push(s); updated++; }
  }
  const markRemoved = existing.filter(e => !incomingIds.has(e.id) && !e.removedFromSheet).map(e => e.id);
  return { upserts, markRemoved, added, updated };
}
