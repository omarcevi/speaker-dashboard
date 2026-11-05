import { describe, it, expect } from 'vitest';
import { topicGroupFor, languageFor, levelFor } from '../src/advocu/mapFields.js';

describe('topicGroupFor', () => {
  it.each([
    ['AI - Gemini, Cloud - Run', 'Generative AI, LLMs & agents'],
    ['Build with AI', 'Generative AI, LLMs & agents'],
    ['AI - Agentic AI', 'Generative AI, LLMs & agents'],
    ['Cloud - API Management', 'Cloud / DevOps / Infrastructure'], // "Management" is not "agent"
    ['AI - TPU, AI - TorchTPU', 'Artificial Intelligence / Machine Learning'],
    ['Google Cloud - BigQuery', 'Cloud / DevOps / Infrastructure'],
    ['Firebase - Hosting', 'Mobile Development'],
    ['Web - Angular', 'Web Development'],
    ['UX / UI Design', 'Product / Design / UX'],
    ['DevFest, Google I/O Extended', 'Other'],
    ['', 'Other'],
  ])('%s -> %s', (topics, group) => {
    expect(topicGroupFor(topics)).toBe(group);
  });
});

describe('languageFor', () => {
  it('keeps only English and Turkish', () => {
    expect(languageFor('English, Arabic')).toBe('English');
    expect(languageFor('Turkish, English')).toBe('English, Turkish');
    expect(languageFor('Turkish')).toBe('Turkish');
    expect(languageFor('French, Hindi')).toBe('');
  });
});

describe('levelFor', () => {
  it('maps and picks a level', () => {
    expect(levelFor('Advance')).toBe('Advanced');
    expect(levelFor('Beginner')).toBe('Beginner');
    expect(levelFor('Beginner, Intermediate, Advance')).toBe('Intermediate');
    expect(levelFor('Advance, Beginner')).toBe('Advanced');
    expect(levelFor('')).toBe('');
  });
});
