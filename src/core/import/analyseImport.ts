import type { z } from 'zod';

import { parseCsvRecords } from '../export/csv';

export const MAX_IMPORT_ROWS = 2000;

export type ImportProblem = { line: number; message: string };

export type ImportAnalysis<T> = {
  valid: T[];
  problems: ImportProblem[];
  missingColumns: string[];
  totalRows: number;
};

type ImportDefinition<T> = {
  // CSV column name to form field. Only the required ones must be present in the file.
  columns: Record<string, string>;
  requiredColumns: string[];
  defaults?: Record<string, string>;
  schema: z.ZodType<T>;
};

// FR-C13, FR-C14: checks every row with the same rules as the capture forms, and reports
// each problem by line number. Nothing is saved at this stage.
export function analyseImport<T>(text: string, definition: ImportDefinition<T>): ImportAnalysis<T> {
  const { headers, rows } = parseCsvRecords(text);
  const missingColumns = definition.requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    return { valid: [], problems: [], missingColumns, totalRows: rows.length };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      valid: [],
      problems: [{ line: 0, message: `This file has ${rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.` }],
      missingColumns: [],
      totalRows: rows.length,
    };
  }

  const valid: T[] = [];
  const problems: ImportProblem[] = [];
  for (const row of rows) {
    const form: Record<string, string> = { ...definition.defaults };
    for (const [column, field] of Object.entries(definition.columns)) {
      const value = row.values[column];
      if (value !== undefined && value !== '') form[field] = value;
      else form[field] ??= '';
    }
    const result = definition.schema.safeParse(form);
    if (result.success) valid.push(result.data);
    else problems.push({ line: row.line, message: result.error.issues[0]?.message ?? 'This row is not valid.' });
  }
  return { valid, problems, missingColumns: [], totalRows: rows.length };
}
