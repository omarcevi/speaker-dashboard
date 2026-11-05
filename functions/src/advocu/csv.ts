/** RFC 4180 parser: quoted cells may hold commas and newlines, "" is a quote. Rows with only empty cells are dropped. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => { endCell(); rows.push(row); row = []; };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') endCell();
    else if (c === '\r') { if (src[i + 1] === '\n') i++; endRow(); }
    else if (c === '\n') endRow();
    else cell += c;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows.filter(r => r.some(c => c !== ''));
}
