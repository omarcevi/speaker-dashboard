import { describe, it, expect } from 'vitest';
import { advocuId, parseAdvocu, ImportRefused, ADVOCU_HEADERS } from '../src/advocu/parseAdvocu.js';
import { fakeAdvocuCsv, FAKE_ADVOCU_ROWS } from '../src/testing/fakeAdvocu.js';

describe('parseAdvocu', () => {
  it('maps a row to an advocu submission', () => {
    const { applications } = parseAdvocu(fakeAdvocuCsv([{ 'Creation date': '2026-10-05T09:30:00.000Z', 'Speaker email': ' Grace@Example.com ',
      'Proposal title': 'Agents 101', 'Proposal topics': 'AI - Agents, Cloud - Run', 'Proposal languages': 'English, Arabic',
      'Audience level': 'Beginner, Advance', Status: 'PENDING' }]));
    const a = applications[0];
    expect(a.id).toBe(advocuId('grace@example.com', '2026-10-05T09:30:00.000Z'));
    expect(a.id).toMatch(/^advocu-[0-9a-f]{16}$/);
    expect(a).toMatchObject({ source: 'advocu', row: 0, timestamp: '2026-10-05T09:30:00.000Z', speakerKey: 'grace@example.com',
      email: 'Grace@Example.com', title: 'Agents 101', topicGroup: 'Generative AI, LLMs & agents', topic: 'AI - Agents, Cloud - Run',
      language: 'English', level: 'Beginner', phone: '', photoFileId: null, coSpeaker: null, noSession: false });
    expect(a.advocu).toMatchObject({ status: 'PENDING', languages: 'English, Arabic', levels: 'Beginner, Advance' });
    expect(a.contentHash).toMatch(/^[0-9a-f]{40}$/);
  });
  it('parses BOM, quoted commas and newlines', () => {
    const csv = '﻿' + fakeAdvocuCsv([{ Bio: 'Line one,\r\nline two' }]);
    expect(parseAdvocu(csv).applications[0].bio).toBe('Line one,\r\nline two');
  });
  it('finds columns by header name, not position', () => {
    const [h, ...rest] = fakeAdvocuCsv().trim().split('\r\n');
    const rev = (l: string) => l.split('","').reverse().join('","');
    const reversed = [rev(h), ...rest.map(rev)].join('\r\n') + '\r\n';
    expect(parseAdvocu(reversed).applications).toEqual(parseAdvocu(fakeAdvocuCsv()).applications);
  });
  it('refuses the Form CSV naming missing columns', () => {
    const run = () => parseAdvocu('Timestamp,Name,Email,Session Title\r\nx,y,z,w\r\n');
    expect(run).toThrow(ImportRefused);
    for (const name of ['Creation date', 'Speaker email', 'Proposal title', 'First name', 'Last name']) {
      expect(run).toThrow(name);
    }
  });
  it('refuses an export with no data rows', () => {
    expect(() => parseAdvocu(fakeAdvocuCsv([]))).toThrow(/no applications/i);
    expect(() => parseAdvocu(fakeAdvocuCsv([]))).toThrow(ImportRefused);
  });
  it('refuses duplicate application keys', () => {
    const same = { 'Creation date': '2026-10-05T09:30:00.000Z', 'Speaker email': 'a@example.com' };
    const csv = fakeAdvocuCsv([same, { ...same, 'Speaker email': 'A@example.com ', 'Proposal title': 'Other' }]);
    expect(() => parseAdvocu(csv)).toThrow(ImportRefused);
    expect(() => parseAdvocu(csv)).toThrow(/same application twice \(row 2 and row 3\)/);
  });
  it('rejects a row with a bad date or missing email or title and keeps the rest', () => {
    const r = parseAdvocu(fakeAdvocuCsv([{}, { 'Creation date': 'yesterday' }, { 'Speaker email': '' }, { 'Proposal title': ' ' }]));
    expect(r.applications).toHaveLength(1);
    expect(r.rejected).toHaveLength(3);
    expect(r.rejected[0]).toMatchObject({ row: 3, reason: expect.stringMatching(/creation date/i) });
    expect(r.rejected[1]).toMatchObject({ row: 4, reason: expect.stringMatching(/email/i) });
    expect(r.rejected[2]).toMatchObject({ row: 5, reason: expect.stringMatching(/title/i) });
  });
  it('collects distinct call-for-papers titles', () => {
    const r = parseAdvocu(fakeAdvocuCsv([{ 'Call for Papers title': 'CFP A' }, { 'Call for Papers title': 'CFP B' }, { 'Call for Papers title': 'CFP A' }]));
    expect(r.cfpTitles).toEqual(['CFP A', 'CFP B']);
  });
  it('same answers give the same contentHash', () => {
    const once = parseAdvocu(fakeAdvocuCsv()).applications;
    const twice = parseAdvocu(fakeAdvocuCsv()).applications;
    expect(once.map(a => a.contentHash)).toEqual(twice.map(a => a.contentHash));
    const changed = parseAdvocu(fakeAdvocuCsv([{ 'Proposal abstract': 'different' }])).applications[0];
    const base = parseAdvocu(fakeAdvocuCsv([{}])).applications[0];
    expect(changed.contentHash).not.toBe(base.contentHash);
  });
  it('default fixture has 26 headers and the ada and grace rows', () => {
    expect(ADVOCU_HEADERS).toHaveLength(26);
    const { applications } = parseAdvocu(fakeAdvocuCsv());
    expect(applications).toHaveLength(FAKE_ADVOCU_ROWS.length);
    expect(applications.filter(a => a.speakerKey === 'grace@example.com')).toHaveLength(2);
    expect(applications.some(a => a.speakerKey === 'ada@example.com' && a.title === 'Fake Talk Two')).toBe(true);
  });
});
