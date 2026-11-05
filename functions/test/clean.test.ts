import { describe, it, expect } from 'vitest';
import { normalizeLink, extractDriveFileId, type LinkKind } from '../src/sheet/clean.js';

describe('normalizeLink', () => {
  const cases: [string, LinkKind, string][] = [
    ['', 'x', ''],
    ['https://www.x.com/a ', 'x', 'https://www.x.com/a'],
    ['www.linkedin.com/in/a', 'linkedin', 'https://www.linkedin.com/in/a'],
    ['@kaan', 'x', 'https://x.com/kaan'],
    ['kaan', 'github', 'https://github.com/kaan'],
    ['kaan', 'instagram', 'https://instagram.com/kaan'],
    ['kaan', 'linkedin', 'https://www.linkedin.com/in/kaan'],
    ['john.doe', 'instagram', 'https://instagram.com/john.doe'],
    ['john.doe', 'x', 'https://x.com/john.doe'],
    ['instagram.com/john.doe', 'instagram', 'https://instagram.com/john.doe'],
  ];
  it.each(cases)('normalizeLink(%j, %s) -> %j', (raw, kind, want) => {
    expect(normalizeLink(raw, kind)).toBe(want);
  });
});

describe('extractDriveFileId', () => {
  const cases: [string, string | null][] = [
    ['https://drive.google.com/open?id=ABC123', 'ABC123'],
    ['https://drive.google.com/file/d/ABC123/view', 'ABC123'],
    ['https://drive.google.com/open?id=A1, https://drive.google.com/open?id=B2', 'A1'],
    ['https://drive.google.com/drive/folders/XYZ', null],
    ['', null],
  ];
  it.each(cases)('extractDriveFileId(%j) -> %j', (url, want) => {
    expect(extractDriveFileId(url)).toBe(want);
  });
});
