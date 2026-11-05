import { ADVOCU_HEADERS } from '../advocu/parseAdvocu.js';

type FakeRow = Partial<Record<string, string>>;

/** Made-up applications; no real people. */
export const FAKE_ADVOCU_ROWS: FakeRow[] = [
  { 'Speaker email': 'ada@example.com', 'First name': 'Ada', 'Last name': 'Fake', 'Proposal title': 'Fake Talk Two',
    'Proposal topics': 'Web - Chrome', 'Proposal languages': 'English', 'Audience level': 'Intermediate', Status: 'PENDING' },
  { 'Speaker email': 'grace@example.com', 'First name': 'Grace', 'Last name': 'Invented', 'Proposal title': 'Fake Agents Talk',
    'Proposal topics': 'AI - Agents', 'Proposal languages': 'English, Turkish', 'Audience level': 'Beginner', Status: 'ACCEPTED' },
  { 'Speaker email': 'grace@example.com', 'First name': 'Grace', 'Last name': 'Invented', 'Proposal title': 'Fake Cloud Talk',
    'Proposal topics': 'Cloud - Run', 'Proposal languages': 'Turkish', 'Audience level': 'Advance', Status: 'PENDING' },
];

const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Quoted CSV with CRLF. Missing cells get defaults; the date and email differ per row index so rows never collide by accident. */
export function fakeAdvocuCsv(rows: FakeRow[] = FAKE_ADVOCU_ROWS): string {
  const lines = [ADVOCU_HEADERS.map(quote).join(',')];
  rows.forEach((r, i) => {
    const defaults: FakeRow = {
      'Creation date': new Date(Date.UTC(2026, 9, 1 + i, 10)).toISOString(),
      Status: 'PENDING',
      'Speaker email': `speaker${i + 1}@example.com`,
      'First name': 'Fake', 'Last name': `Speaker${i + 1}`,
      'Proposal title': `Fake Proposal ${i + 1}`,
      'Proposal abstract': 'A made-up abstract.',
      'Call for Papers title': 'Fake DevFest CFP',
    };
    lines.push(ADVOCU_HEADERS.map(h => quote(r[h] ?? defaults[h] ?? '')).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}
