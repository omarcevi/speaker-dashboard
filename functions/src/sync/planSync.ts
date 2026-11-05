import type { SubmissionData } from '../model.js';

export interface ExistingSubmission { id: string; contentHash: string; removedFromSheet: boolean }
export interface SyncPlan { upserts: SubmissionData[]; markRemoved: string[]; added: number; updated: number; moved: { id: string; from: string }[] }

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
  // Same content now under a different id than the one that stored it: the sheet was sorted or had rows inserted/deleted.
  const idByHash = new Map<string, string[]>();
  for (const e of existing) idByHash.set(e.contentHash, [...(idByHash.get(e.contentHash) ?? []), e.id]);
  const moved: { id: string; from: string }[] = [];
  for (const s of incoming) {
    if (byId.get(s.id)?.contentHash === s.contentHash) continue;
    const from = (idByHash.get(s.contentHash) ?? []).find(id => id !== s.id);
    if (from !== undefined) moved.push({ id: s.id, from });
  }
  const markRemoved = existing.filter(e => !incomingIds.has(e.id) && !e.removedFromSheet).map(e => e.id);
  return { upserts, markRemoved, added, updated, moved };
}
