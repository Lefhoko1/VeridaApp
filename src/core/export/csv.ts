type Cell = string | number | null | undefined;

// A text cell starting with one of these runs as a formula when opened in a spreadsheet.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function encodeCell(cell: Cell): string {
  if (cell === null || cell === undefined) return '""';
  const raw = typeof cell === 'number' ? String(cell) : FORMULA_PREFIX.test(cell) ? `'${cell}` : cell;
  return `"${raw.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((row) => row.map(encodeCell).join(',')).join('\n');
}

// Reads CSV as written by spreadsheets: quoted cells, doubled quotes, and line breaks inside quotes.
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

// Undoes the protection toCsv adds, so an export can be imported again unchanged.
const stripFormulaGuard = (value: string) => (/^'[=+\-@]/.test(value) ? value.slice(1) : value);

export type CsvRow = { line: number; values: Record<string, string> };

// Headers are matched case-insensitively. A row keeps its line number for error reports.
export function parseCsvRecords(text: string): { headers: string[]; rows: CsvRow[] } {
  const [headerRow, ...dataRows] = parseCsvRows(text);
  const headers = (headerRow ?? []).map((header) => header.trim().toLowerCase());
  return {
    headers,
    rows: dataRows.map((cells, index) => ({
      line: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, stripFormulaGuard((cells[column] ?? '').trim())])),
    })),
  };
}
