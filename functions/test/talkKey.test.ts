import { describe, it, expect } from 'vitest';
import { titleKey, talkKey } from '../src/talkKey.js';

describe('titleKey', () => {
  it('lower-cases and strips punctuation', () => {
    expect(titleKey('  Building Agents: A Guide! ')).toBe('building agents a guide');
  });
  it('folds Turkish characters and apostrophes', () => {
    expect(titleKey('İstanbul’da Flutter')).toBe(titleKey('istanbul da flutter'));
  });
  it('drops emoji', () => {
    expect(titleKey('Kotlin ❤️ Compose')).toBe('kotlin compose');
  });
});

describe('talkKey', () => {
  it('joins speaker key and title key', () => {
    expect(talkKey('a@x.com', 'Hello, World')).toBe('a@x.com|hello world');
  });
  it('is null for an empty title', () => {
    expect(talkKey('a@x.com', '  ')).toBeNull();
  });
});
