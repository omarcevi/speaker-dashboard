import { describe, it, expect } from 'vitest';
import { planImport, type StoredDoc } from '../src/advocu/planImport.js';
import type { SubmissionData } from '../src/model.js';

const inc = (id: string, contentHash: string, speakerKey = 'a@example.com', title = 'Talk') =>
  ({ id, contentHash, speakerKey, title, source: 'advocu' }) as SubmissionData;
const st = (id: string, contentHash: string, o: Partial<StoredDoc> = {}): StoredDoc =>
  ({ id, source: 'advocu', contentHash, removedFromSheet: false, speakerKey: 'a@example.com', title: 'Talk', ...o });

describe('planImport', () => {
  it('adds new, updates changed, skips unchanged', () => {
    const p = planImport(
      [inc('advocu-1', 'h1', 'a@example.com', 'One'), inc('advocu-2', 'h2b', 'b@example.com', 'Two'), inc('advocu-3', 'h3', 'c@example.com', 'Three')],
      [st('advocu-2', 'h2', { speakerKey: 'b@example.com', title: 'Two' }), st('advocu-3', 'h3', { speakerKey: 'c@example.com', title: 'Three' })], []);
    expect(p.counts).toMatchObject({ total: 3, added: 1, updated: 1, unchanged: 1, restored: 0, hidden: 0 });
    expect(p.upserts.map(s => s.id)).toEqual(['advocu-1', 'advocu-2']);
  });
  it('hides stored advocu docs missing from the export', () => {
    const p = planImport([inc('advocu-1', 'h1')], [st('advocu-1', 'h1'), st('advocu-9', 'h9', { title: 'Other' })], []);
    expect(p.markRemoved).toEqual(['advocu-9']);
    expect(p.counts.hidden).toBe(1);
  });
  it('restores a hidden doc that reappears', () => {
    const p = planImport([inc('advocu-1', 'h1')], [st('advocu-1', 'h1', { removedFromSheet: true })], []);
    expect(p.upserts.map(s => s.id)).toEqual(['advocu-1']);
    expect(p.counts).toMatchObject({ restored: 1, updated: 0, unchanged: 0, added: 0 });
  });
  it('does not re-hide already removed docs', () => {
    const p = planImport([], [st('advocu-9', 'h9', { removedFromSheet: true })], []);
    expect(p.markRemoved).toEqual([]);
    expect(p.counts.hidden).toBe(0);
  });
  it('never touches form docs', () => {
    const p = planImport([], [st('row-2', 'f1', { source: 'form' })], []);
    expect(p.markRemoved).toEqual([]);
  });
  it('re-matches by email + title when the key changed', () => {
    const p = planImport([inc('advocu-B', 'h1')], [st('advocu-A', 'h0')], []);
    expect(p.upserts.map(s => s.id)).toEqual(['advocu-A']);
    expect(p.counts).toMatchObject({ rematched: 1, hidden: 0, added: 0 });
    expect(p.markRemoved).toEqual([]);
  });
  it('does not re-match when two stored docs share speaker+title', () => {
    const p = planImport([inc('advocu-B', 'h1')], [st('advocu-A1', 'h0'), st('advocu-A2', 'h0')], []);
    expect(p.upserts.map(s => s.id)).toEqual(['advocu-B']);
    expect(p.counts).toMatchObject({ rematched: 0, added: 1, hidden: 2 });
    expect(p.markRemoved.sort()).toEqual(['advocu-A1', 'advocu-A2']);
  });
  it('counts merges with non-removed form docs', () => {
    const form = st('row-2', 'f1', { source: 'form' });
    expect(planImport([inc('advocu-1', 'h1')], [form], []).counts.merged).toBe(1);
    expect(planImport([inc('advocu-1', 'h1')], [{ ...form, removedFromSheet: true }], []).counts.merged).toBe(0);
  });
  it('counts distinct speakers', () => {
    const p = planImport([inc('advocu-1', 'h1', 'a@example.com', 'X'), inc('advocu-2', 'h2', 'a@example.com', 'Y'), inc('advocu-3', 'h3', 'b@example.com', 'Z')], [], []);
    expect(p.counts.speakers).toBe(2);
  });
  it('warns when more than half would be hidden', () => {
    const p = planImport([inc('advocu-1', 'h1', 'a@example.com', 'One')], [
      st('advocu-1', 'h1', { title: 'One' }), st('advocu-2', 'h2', { title: 'Two' }), st('advocu-3', 'h3', { title: 'Three' })], []);
    expect(p.counts.warnings[0]).toMatch(/2 of 3/);
  });
  it('warns on more than one call for papers', () => {
    const p = planImport([], [], ['Alpha CFP', 'Beta CFP']);
    expect(p.counts.warnings.join(' ')).toContain('Alpha CFP');
    expect(p.counts.warnings.join(' ')).toContain('Beta CFP');
  });
});
