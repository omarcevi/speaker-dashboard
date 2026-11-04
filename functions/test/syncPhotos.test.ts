import { describe, it, expect } from 'vitest';
import { syncPhotos, type PhotoDeps } from '../src/photos/syncPhotos.js';
import type { SubmissionData } from '../src/model.js';

const sub = (photoFileId: string | null) => ({ photoFileId, photoUrl: '' }) as SubmissionData;
const png = { data: Buffer.from('x'), contentType: 'image/png' };

function deps(over: Partial<PhotoDeps> = {}) {
  const saved: Array<{ path: string; contentType: string }> = [];
  const d: PhotoDeps = {
    exists: async () => false,
    download: async () => png,
    save: async (path, _data, contentType) => { saved.push({ path, contentType }); },
    ...over,
  };
  return { d, saved };
}

describe('syncPhotos', () => {
  it('skips a photo that already exists', async () => {
    const { d, saved } = deps({ exists: async () => true });
    expect(await syncPhotos([sub('ID')], d)).toEqual({ copied: 0, skipped: 1, failed: [] });
    expect(saved).toEqual([]);
  });

  it('copies a new photo to photos/ID', async () => {
    const { d, saved } = deps();
    expect(await syncPhotos([sub('ID')], d)).toEqual({ copied: 1, skipped: 0, failed: [] });
    expect(saved).toEqual([{ path: 'photos/ID', contentType: 'image/png' }]);
  });

  it('fails non-image content', async () => {
    const { d, saved } = deps({ download: async () => ({ data: Buffer.from('x'), contentType: 'application/pdf' }) });
    expect((await syncPhotos([sub('ID')], d)).failed).toEqual(['ID']);
    expect(saved).toEqual([]);
  });

  it('fails files over 10 MB', async () => {
    const { d } = deps({ download: async () => ({ data: Buffer.alloc(11 * 1024 * 1024), contentType: 'image/png' }) });
    expect((await syncPhotos([sub('ID')], d)).failed).toEqual(['ID']);
  });

  it('keeps going when one download throws', async () => {
    const { d, saved } = deps({ download: async id => { if (id === 'BAD') throw new Error('nope'); return png; } });
    const r = await syncPhotos([sub('A'), sub('BAD'), sub('C')], d);
    expect(r).toEqual({ copied: 2, skipped: 0, failed: ['BAD'] });
    expect(saved.map(s => s.path).sort()).toEqual(['photos/A', 'photos/C']);
  });

  it('counts a throwing exists/save as failed too', async () => {
    const { d } = deps({ save: async () => { throw new Error('quota'); } });
    expect((await syncPhotos([sub('A')], d)).failed).toEqual(['A']);
  });

  it('ignores null photoFileId', async () => {
    const { d } = deps();
    expect(await syncPhotos([sub(null)], d)).toEqual({ copied: 0, skipped: 0, failed: [] });
  });

  it('rejects unsafe file ids without touching deps', async () => {
    const { d, saved } = deps({ exists: async () => { throw new Error('should not be called'); } });
    const r = await syncPhotos([sub('../x'), sub('a/b')], d);
    expect(r).toEqual({ copied: 0, skipped: 0, failed: ['../x', 'a/b'] });
    expect(saved).toEqual([]);
  });

  it('deduplicates ids shared by several talks', async () => {
    let downloads = 0;
    const { d } = deps({ download: async () => { downloads++; return png; } });
    expect(await syncPhotos([sub('A'), sub('A'), sub('A')], d)).toEqual({ copied: 1, skipped: 0, failed: [] });
    expect(downloads).toBe(1);
  });

  it('runs at most 5 at a time', async () => {
    let active = 0, peak = 0;
    const { d } = deps({
      download: async () => {
        active++; peak = Math.max(peak, active);
        await new Promise(r => setTimeout(r, 5));
        active--; return png;
      },
    });
    const subs = Array.from({ length: 20 }, (_, i) => sub(`id${i}`));
    expect((await syncPhotos(subs, d)).copied).toBe(20);
    expect(peak).toBe(5);
  });
});
