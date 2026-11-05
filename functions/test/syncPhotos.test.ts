import { describe, it, expect, vi, afterEach } from 'vitest';
import { syncPhotos, type PhotoDeps } from '../src/photos/syncPhotos.js';
import type { SubmissionData } from '../src/model.js';

const sub = (photoFileId: string | null) => ({ photoFileId, photoUrl: '' }) as SubmissionData;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('rest')]);
const png = { data: PNG };
afterEach(() => vi.restoreAllMocks());

function deps(over: Partial<PhotoDeps> = {}) {
  const saved: Array<{ path: string; contentType: string }> = [];
  const d: PhotoDeps = {
    exists: async () => false,
    meta: async () => ({ mimeType: 'image/png', size: 100 }),
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

  it('rejects an SVG at meta and logs a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const download = vi.fn(async () => png);
    const { d, saved } = deps({ meta: async () => ({ mimeType: 'image/svg+xml', size: 10 }), download });
    expect((await syncPhotos([sub('ID')], d)).failed).toEqual(['ID']);
    expect(download).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    expect(warn).toHaveBeenCalledWith('Photo rejected', 'ID', expect.stringContaining('svg'));
  });

  it('rejects meta size over 10 MB without downloading', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const download = vi.fn(async () => png);
    const { d } = deps({ meta: async () => ({ mimeType: 'image/png', size: 11 * 1024 * 1024 }), download });
    expect((await syncPhotos([sub('ID')], d)).failed).toEqual(['ID']);
    expect(download).not.toHaveBeenCalled();
  });

  it('rejects a downloaded body over 10 MB', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { d } = deps({ download: async () => ({ data: Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024)]) }) });
    expect((await syncPhotos([sub('ID')], d)).failed).toEqual(['ID']);
  });

  it('saves with the sniffed type, not the declared one', async () => {
    const { d, saved } = deps({ download: async () => ({ data: JPG }) });
    expect((await syncPhotos([sub('ID')], d)).copied).toBe(1);
    expect(saved).toEqual([{ path: 'photos/ID', contentType: 'image/jpeg' }]);
  });

  it('recognises gif and webp bytes', async () => {
    const gif = Buffer.from('GIF89a....');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
    const bodies: Record<string, Buffer> = { G: gif, W: webp };
    const { d, saved } = deps({ download: async id => ({ data: bodies[id] }) });
    await syncPhotos([sub('G'), sub('W')], d);
    expect(saved.map(s => s.contentType).sort()).toEqual(['image/gif', 'image/webp']);
  });

  it('rejects random bytes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { d, saved } = deps({ download: async () => ({ data: Buffer.from('not an image at all') }) });
    expect((await syncPhotos([sub('ID')], d)).failed).toEqual(['ID']);
    expect(saved).toEqual([]);
  });

  it('does not download when the photo exists', async () => {
    const meta = vi.fn(async () => ({ mimeType: 'image/png', size: 1 }));
    const { d } = deps({ exists: async () => true, meta });
    await syncPhotos([sub('ID')], d);
    expect(meta).not.toHaveBeenCalled();
  });

  it('keeps going when one download throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { d, saved } = deps({ download: async id => { if (id === 'BAD') throw new Error('nope'); return png; } });
    const r = await syncPhotos([sub('A'), sub('BAD'), sub('C')], d);
    expect(r).toEqual({ copied: 2, skipped: 0, failed: ['BAD'] });
    expect(saved.map(s => s.path).sort()).toEqual(['photos/A', 'photos/C']);
    expect(err).toHaveBeenCalledWith('Photo copy failed', 'BAD', expect.any(Error));
  });

  it.each(['exists', 'meta', 'save', 'download'] as const)('isolates a throwing %s and logs it', async which => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = () => { throw new Error('boom'); }; // synchronous throw, not a rejected promise
    const { d } = deps({ [which]: boom } as Partial<PhotoDeps>);
    expect((await syncPhotos([sub('A')], d)).failed).toEqual(['A']);
    expect(err).toHaveBeenCalledWith('Photo copy failed', 'A', expect.any(Error));
  });

  it('ignores null photoFileId', async () => {
    const { d } = deps();
    expect(await syncPhotos([sub(null)], d)).toEqual({ copied: 0, skipped: 0, failed: [] });
  });

  it('rejects unsafe file ids without touching deps', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
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
