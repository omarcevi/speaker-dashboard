import { describe, it, expect } from 'vitest';
import { parseCsv } from '../src/advocu/csv.js';

describe('parseCsv', () => {
  it('reads CRLF rows', () => expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]));
  it('handles BOM, quoted commas, doubled quotes and newlines in cells', () =>
    expect(parseCsv('﻿a,"b, c","say ""hi""","l1\r\nl2"\n')).toEqual([['a', 'b, c', 'say "hi"', 'l1\r\nl2']]));
  it('drops trailing blank lines', () => expect(parseCsv('a\n\n')).toEqual([['a']]));
  it('keeps a last row with no final newline', () => expect(parseCsv('a,b\n1,')).toEqual([['a', 'b'], ['1', '']]));
});
