import type { ImportSummary, SubmissionData } from '../model.js';
import { talkKey } from '../talkKey.js';

export interface StoredDoc { id: string; source: 'form' | 'advocu'; contentHash: string; removedFromSheet: boolean; speakerKey: string; title: string }
export interface ImportPlan { upserts: SubmissionData[]; markRemoved: string[]; counts: Omit<ImportSummary, 'mode' | 'cfpTitles' | 'rejected'> }

/** Pure diff of a parsed Advocu export against stored docs. Only stored Advocu docs are ever hidden, restored or re-matched. */
export function planImport(incoming: SubmissionData[], stored: StoredDoc[], cfpTitles: string[]): ImportPlan {
  const byId = new Map(stored.map(d => [d.id, d]));
  const incomingIds = new Set(incoming.map(s => s.id));

  // Fallback re-match pool: stored Advocu docs not matched by id in this import, grouped by talk key.
  const pool = new Map<string, StoredDoc[]>();
  for (const d of stored) {
    if (d.source !== 'advocu' || incomingIds.has(d.id)) continue;
    const k = talkKey(d.speakerKey, d.title);
    if (k !== null) pool.set(k, [...(pool.get(k) ?? []), d]);
  }
  // Unmatched incoming docs per talk key, so two incoming rows never claim one stored doc.
  const claimants = new Map<string, number>();
  for (const s of incoming) {
    if (byId.has(s.id)) continue;
    const k = talkKey(s.speakerKey, s.title);
    if (k !== null) claimants.set(k, (claimants.get(k) ?? 0) + 1);
  }

  const formKeys = new Set<string>();
  for (const d of stored) {
    if (d.source !== 'form' || d.removedFromSheet) continue;
    const k = talkKey(d.speakerKey, d.title);
    if (k !== null) formKeys.add(k);
  }

  const upserts: SubmissionData[] = [];
  const matchedStored = new Set<string>();
  let added = 0, updated = 0, unchanged = 0, restored = 0, merged = 0, rematched = 0;

  for (const s of incoming) {
    const k = talkKey(s.speakerKey, s.title);
    if (k !== null && formKeys.has(k)) merged++;
    let prev = byId.get(s.id);
    let doc = s;
    let viaRematch = false;
    if (!prev && k !== null) {
      const cands = pool.get(k) ?? [];
      if (cands.length === 1 && claimants.get(k) === 1 && !matchedStored.has(cands[0].id)) {
        prev = cands[0];
        doc = { ...s, id: prev.id };
        viaRematch = true;
        rematched++;
      }
    }
    if (prev) matchedStored.add(prev.id);
    if (!prev) { upserts.push(doc); added++; }
    else if (prev.removedFromSheet) { upserts.push(doc); restored++; }
    else if (viaRematch || prev.contentHash !== s.contentHash) { upserts.push(doc); updated++; }
    else unchanged++;
  }

  const storedActive = stored.filter(d => d.source === 'advocu' && !d.removedFromSheet);
  const markRemoved = storedActive.filter(d => !matchedStored.has(d.id)).map(d => d.id);

  const warnings: string[] = [];
  if (markRemoved.length * 2 > storedActive.length) {
    warnings.push(`${markRemoved.length} of ${storedActive.length} stored Advocu applications are missing from this export and would be hidden. Check that this is the right, unfiltered export.`);
  }
  if (cfpTitles.length > 1) {
    warnings.push(`The file has ${cfpTitles.length} call-for-papers titles: ${cfpTitles.join(', ')}.`);
  }

  return {
    upserts,
    markRemoved,
    counts: {
      total: incoming.length, added, updated, unchanged, restored, hidden: markRemoved.length, merged,
      speakers: new Set(incoming.map(s => s.speakerKey)).size, rematched, warnings,
    },
  };
}
