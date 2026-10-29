import { describe, it, expect } from 'vitest';
import { parseSheet } from '../src/sheet/parseSheet.js';
import { HEADER_ROW, makeRow } from '../src/testing/fakeRows.js';

const parse = (rows: string[][], header = HEADER_ROW) => parseSheet([header, ...rows]);

describe('parseSheet', () => {
  it('first response is row 2 / id row-2', () =>
    expect(parse([makeRow()]).submissions[0]).toMatchObject({ row: 2, id: 'row-2' }));
  it('matches headers ignoring trailing spaces, "?", and year', () => {
    const h = HEADER_ROW.map(x => x.replace('2026', '2027').trimEnd());
    expect(parse([makeRow({ whyDevFest: 'because' })], h).submissions[0].whyDevFest).toBe('because');
  });
  it('ragged row: missing trailing cells become empty', () => {
    const s = parse([makeRow({ title: 'T' }).slice(0, 20)]).submissions[0];
    expect(s.consent).toEqual({ codeOfConduct: '', recording: '', personalData: '' });
    expect(s.logistics.tshirt).toBe('');
  });
  it('reports missing columns and still imports', () => {
    const i = HEADER_ROW.indexOf('Code of Conduct');
    const drop = (r: string[]) => r.filter((_, j) => j !== i);
    const r = parse([drop(makeRow())], drop(HEADER_ROW));
    expect(r.missingColumns).toEqual(['codeOfConduct']);
    expect(r.submissions).toHaveLength(1);
  });
  it('trims and groups by lowercased email', () => {
    const s = parse([makeRow({ firstName: 'Kaan ', email: ' Foo@Bar.com ' })]).submissions[0];
    expect(s.firstName).toBe('Kaan');
    expect(s.speakerKey).toBe('foo@bar.com');
  });
  it('blank email -> speakerKey no-email:row-N', () =>
    expect(parse([makeRow({ email: '' })]).submissions[0].speakerKey).toBe('no-email:row-2'));
  it('skips fully blank rows but keeps numbering', () => {
    const r = parse([HEADER_ROW.map(() => ''), makeRow()]).submissions;
    expect(r.map(s => s.row)).toEqual([3]);
  });
  it('no title -> noSession', () =>
    expect(parse([makeRow({ title: '  ' })]).submissions[0].noSession).toBe(true));
  it('Other area shows the other text, groups as Other', () =>
    expect(parse([makeRow({ area: 'Other (please specify)', areaOther: 'Runtime dev' })]).submissions[0])
      .toMatchObject({ topic: 'Runtime dev', topicGroup: 'Other' }));
  it('empty area -> topicGroup Unspecified', () =>
    expect(parse([makeRow({ area: '' })]).submissions[0].topicGroup).toBe('Unspecified'));
  it('coSpeaker only when name or email present', () => {
    expect(parse([makeRow({ coFirstName: '', coEmail: '' })]).submissions[0].coSpeaker).toBeNull();
    expect(parse([makeRow({ coFirstName: 'Rishi' })]).submissions[0].coSpeaker?.firstName).toBe('Rishi');
  });
  it('contentHash stable for same row, changes on edit', () => {
    const a = parse([makeRow()]).submissions[0];
    const b = parse([makeRow()]).submissions[0];
    const c = parse([makeRow({ timestamp: 'x', abstract: 'edited' })]).submissions[0];
    expect(a.contentHash).toBe(b.contentHash);
    expect(c.contentHash).not.toBe(a.contentHash);
  });
  it('fakeSheet parses with no missing columns', () => {
    const r = parseSheet(fakeSheet());
    expect(r.missingColumns).toEqual([]);
    expect(r.submissions.length).toBeGreaterThanOrEqual(10);
  });
});
import { fakeSheet } from '../src/testing/fakeRows.js';
