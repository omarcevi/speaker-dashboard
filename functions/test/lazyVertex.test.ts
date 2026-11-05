import { describe, it, expect, vi } from 'vitest';

// Records whether anything imports the Vertex SDK. Nothing here calls it.
const sdk = vi.hoisted(() => ({ loaded: false }));
vi.mock('@google/genai', async (importOriginal) => {
  sdk.loaded = true;
  return importOriginal();
});

describe('functions entry point', () => {
  it('does not load the Vertex SDK at import, so syncNow, scheduledSync and importAdvocu never pay for it', async () => {
    const mod = await import('../src/index.js');
    expect(Object.keys(mod)).toEqual(expect.arrayContaining(['syncNow', 'scheduledSync', 'importAdvocu', 'refreshAi', 'regenerateAi']));
    expect(sdk.loaded).toBe(false);
  });
});
