import { describe, it, expect } from 'vitest';
import { planSync } from '../src/sync/planSync.js';
import type { SubmissionData } from '../src/model.js';

const sub = (id: string, contentHash: string) => ({ id, contentHash }) as SubmissionData;
const ex = (id: string, contentHash: string, removedFromSheet = false) => ({ id, contentHash, removedFromSheet });

describe('planSync', () => {
  it('new id is upserted and counted as added', () => {
    const p = planSync([sub('row-2', 'h1')], []);
    expect(p.upserts.map(s => s.id)).toEqual(['row-2']);
    expect(p).toMatchObject({ added: 1, updated: 0, markRemoved: [] });
  });
  it('same hash does nothing', () => {
    expect(planSync([sub('row-2', 'h1')], [ex('row-2', 'h1')]))
      .toEqual({ upserts: [], markRemoved: [], added: 0, updated: 0 });
  });
  it('changed hash on the same id is one update, not an add', () => {
    const p = planSync([sub('row-2', 'h2')], [ex('row-2', 'h1')]);
    expect(p.upserts.map(s => s.id)).toEqual(['row-2']);
    expect(p).toMatchObject({ added: 0, updated: 1, markRemoved: [] });
  });
  it('existing id absent from incoming is marked removed', () => {
    expect(planSync([], [ex('row-3', 'h1')]).markRemoved).toEqual(['row-3']);
  });
  it('already-removed id still absent is not marked again', () => {
    expect(planSync([], [ex('row-3', 'h1', true)]).markRemoved).toEqual([]);
  });
  it('removed id reappearing with the same hash is upserted as updated', () => {
    const p = planSync([sub('row-3', 'h1')], [ex('row-3', 'h1', true)]);
    expect(p.upserts.map(s => s.id)).toEqual(['row-3']);
    expect(p).toMatchObject({ added: 0, updated: 1 });
  });
});
