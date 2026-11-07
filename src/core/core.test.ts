import { z } from 'zod';

import { AppError } from './errors/AppError';
import { parseCsvRecords, parseCsvRows, toCsv } from './export/csv';
import { analyseImport, MAX_IMPORT_ROWS } from './import/analyseImport';
import { dateField, numberField, optionalNumberField } from './forms/fields';
import { formatDate, formatMoney, formatMonth } from './format/format';
import { createChunkedSecureStore, splitIntoChunks } from './storage/keyValueStore';
import { mapProviderError } from './supabase/mapError';
import { parseRow, parseRows } from './supabase/response';

describe('form fields', () => {
  it.each(['2026-11-02', '2024-02-29'])('accepts the real date %s', (value) => {
    expect(dateField.safeParse(value).success).toBe(true);
  });

  it.each(['2026-02-30', '2025-02-29', '02/11/2026', '2026-13-01', ''])('rejects %s', (value) => {
    expect(dateField.safeParse(value).success).toBe(false);
  });

  it('turns text into numbers and enforces the minimum', () => {
    const quantity = numberField('Quantity', { min: 0, exclusiveMin: true });
    expect(quantity.parse('1.5')).toBe(1.5);
    expect(quantity.safeParse('0').success).toBe(false);
    expect(quantity.safeParse('abc').success).toBe(false);
    expect(quantity.safeParse('').success).toBe(false);
  });

  it('treats an empty optional number as null, not zero', () => {
    const field = optionalNumberField('Quantity', { min: 0 });
    expect(field.parse('')).toBeNull();
    expect(field.parse('0')).toBe(0);
    expect(field.safeParse('-1').success).toBe(false);
  });
});

describe('formatting', () => {
  it('uses the prototype currency format', () => {
    expect(formatMoney(1234.5, 'BWP')).toBe('P1,234.50');
    expect(formatMoney(-70, 'BWP')).toBe('-P70.00');
    expect(formatMoney(10, 'EUR')).toBe('EUR 10.00');
  });

  it('formats a date without shifting it across timezones', () => {
    expect(formatDate('2026-11-02')).toBe('2 Nov 2026');
    expect(formatMonth('2026-11-01')).toBe('Nov 26');
  });
});

describe('CSV export', () => {
  it('quotes cells and escapes quotes', () => {
    expect(toCsv(['A', 'B'], [['say "hi"', 3]])).toBe('"A","B"\n"say ""hi""","3"');
  });

  it('leaves missing values empty', () => {
    expect(toCsv(['A'], [[null], [undefined]])).toBe('"A"\n""\n""');
  });

  it('neutralises text that a spreadsheet would run as a formula', () => {
    expect(toCsv(['A'], [['=HYPERLINK("x")']])).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('does not alter negative numbers', () => {
    expect(toCsv(['A'], [[-5]])).toBe('"A"\n"-5"');
  });
});

describe('CSV import (FR-C12 to FR-C14)', () => {
  const definition = {
    columns: { date: 'date', item: 'item', quantity: 'quantity', notes: 'notes' },
    requiredColumns: ['date', 'item', 'quantity'],
    defaults: { notes: 'none' },
    schema: z.object({
      date: dateField,
      item: z.string().min(1, 'Item is required.'),
      quantity: numberField('Quantity', { min: 0, exclusiveMin: true }),
      notes: z.string(),
    }),
  };

  it('reads quoted cells, doubled quotes, commas and line breaks', () => {
    expect(parseCsvRows('a,"b,c","say ""hi""","two\nlines"\r\n1,2,3,4')).toEqual([
      ['a', 'b,c', 'say "hi"', 'two\nlines'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('ignores blank lines and a byte order mark', () => {
    expect(parseCsvRows('﻿a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('matches headers regardless of case, and keeps real line numbers', () => {
    const { rows } = parseCsvRecords('Date,ITEM\n2026-01-01,Eggs');
    expect(rows[0]).toEqual({ line: 2, values: { date: '2026-01-01', item: 'Eggs' } });
  });

  it('round-trips an export, including its formula protection', () => {
    const { rows } = parseCsvRecords(toCsv(['Note'], [['=SUM(A1)'], ['-5 items'], ['plain']]));
    expect(rows.map((row) => row.values.note)).toEqual(['=SUM(A1)', '-5 items', 'plain']);
  });

  it('parses valid rows with the capture rules, applying defaults', () => {
    const result = analyseImport('date,item,quantity\n2026-01-01,Eggs,2', definition);
    expect(result.valid).toEqual([{ date: '2026-01-01', item: 'Eggs', quantity: 2, notes: 'none' }]);
    expect(result.problems).toEqual([]);
  });

  it('reports each invalid row by line, without stopping at the first', () => {
    const result = analyseImport('date,item,quantity\n2026-01-01,Eggs,2\nnot-a-date,Eggs,2\n2026-01-03,,2\n2026-01-04,Eggs,-1', definition);
    expect(result.valid).toHaveLength(1);
    expect(result.problems.map((problem) => problem.line)).toEqual([3, 4, 5]);
    expect(result.problems[1]?.message).toBe('Item is required.');
  });

  it('reports missing columns instead of every row failing', () => {
    const result = analyseImport('date,item\n2026-01-01,Eggs', definition);
    expect(result.missingColumns).toEqual(['quantity']);
    expect(result.valid).toEqual([]);
  });

  it('copes with an empty file', () => {
    expect(analyseImport('', definition).missingColumns).toEqual(['date', 'item', 'quantity']);
  });

  it('refuses a file over the row limit', () => {
    const body = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => '2026-01-01,Eggs,1').join('\n');
    const result = analyseImport(`date,item,quantity\n${body}`, definition);
    expect(result.valid).toEqual([]);
    expect(result.problems[0]?.message).toContain('at most');
  });
});

describe('chunked secure store', () => {
  function memoryBackend() {
    const data = new Map<string, string>();
    return {
      data,
      getItemAsync: async (key: string) => data.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        data.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        data.delete(key);
      },
    };
  }

  it('splits long values and rebuilds them exactly', async () => {
    const backend = memoryBackend();
    const store = createChunkedSecureStore(backend);
    const token = 'x'.repeat(5000);
    await store.setItem('session', token);
    expect([...backend.data.values()].every((value) => value.length <= 2048)).toBe(true);
    await expect(store.getItem('session')).resolves.toBe(token);
  });

  it('leaves no chunks behind when a shorter value replaces a longer one', async () => {
    const backend = memoryBackend();
    const store = createChunkedSecureStore(backend);
    await store.setItem('session', 'x'.repeat(5000));
    await store.setItem('session', 'short');
    expect(backend.data.size).toBe(2);
    await expect(store.getItem('session')).resolves.toBe('short');
  });

  it('removes every chunk', async () => {
    const backend = memoryBackend();
    const store = createChunkedSecureStore(backend);
    await store.setItem('session', 'x'.repeat(5000));
    await store.removeItem('session');
    expect(backend.data.size).toBe(0);
    await expect(store.getItem('session')).resolves.toBeNull();
  });

  it('treats a torn write as absent rather than returning a corrupt token', async () => {
    const backend = memoryBackend();
    const store = createChunkedSecureStore(backend);
    await store.setItem('session', 'x'.repeat(5000));
    backend.data.delete('session.1');
    await expect(store.getItem('session')).resolves.toBeNull();
  });

  it('handles an empty value', async () => {
    expect(splitIntoChunks('')).toEqual(['']);
    const store = createChunkedSecureStore(memoryBackend());
    await store.setItem('k', '');
    await expect(store.getItem('k')).resolves.toBe('');
  });
});

describe('provider error mapping', () => {
  it('replaces generic RLS errors with readable text', () => {
    const error = mapProviderError({ code: '42501', message: 'new row violates row-level security policy for table "x"' });
    expect(error.code).toBe('forbidden');
    expect(error.message).toBe('You do not have permission to do this.');
  });

  it('keeps messages written for users by our SQL functions', () => {
    const error = mapProviderError({ code: '42501', message: 'Only the business owner can do this.' });
    expect(error.message).toBe('Only the business owner can do this.');
  });

  it('does not leak constraint names', () => {
    const error = mapProviderError({ code: '23505', message: 'duplicate key value violates unique constraint "products_business_id_name_key"' });
    expect(error.code).toBe('conflict');
    expect(error.message).not.toContain('products_business_id_name_key');
  });

  it.each(['23001', '23503'])('explains a delete blocked by related records (%s)', (code) => {
    const error = mapProviderError({ code, message: 'violates foreign key constraint "sales_product_fkey"' });
    expect(error.code).toBe('conflict');
    expect(error.message).toBe('This is still used by other records, so it cannot be removed.');
  });

  it('explains a schema that has not been exposed', () => {
    expect(mapProviderError({ code: 'PGRST106', message: 'schema must be one of' }).message).toContain('setup guide');
  });

  it('recognises network failures', () => {
    expect(mapProviderError({ message: 'TypeError: Failed to fetch' }).code).toBe('network');
  });

  it('never surfaces an unknown provider message', () => {
    const error = mapProviderError({ code: 'XX000', message: 'internal: secret table layout' });
    expect(error.message).not.toContain('secret');
  });
});

describe('response parsing', () => {
  const schema = z.object({ id: z.string() });

  it('rejects rows that do not match the expected shape', () => {
    expect(() => parseRows(schema, { data: [{ id: 1 }], error: null })).toThrow(AppError);
  });

  it('raises the mapped error rather than parsing', () => {
    expect(() => parseRow(schema, { data: null, error: { code: 'PGRST116', message: 'no rows' } })).toThrow('could not be found');
  });

  it('reports a missing row as not found', () => {
    expect(() => parseRow(schema, { data: null, error: null })).toThrow('could not be found');
  });
});
