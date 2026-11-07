import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { errorMessage } from '../errors/AppError';
import type { ImportAnalysis } from './analyseImport';
import { pickTextFile } from './pickTextFile';

const CSV_TYPES = ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', 'text/plain'];

type CsvImportOptions<T> = {
  analyse: (text: string) => ImportAnalysis<T>;
  commit: (rows: T[]) => Promise<void>;
  onCommitted: (count: number) => void;
};

// The import flow for a ViewModel: choose a file, review what was found, then confirm.
export function useCsvImport<T>({ analyse, commit, onCommitted }: CsvImportOptions<T>) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis<T> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFileName(null);
    setAnalysis(null);
    setError(null);
  }, []);

  const save = useMutation({
    mutationFn: (rows: T[]) => commit(rows),
    onSuccess: (_result, rows) => onCommitted(rows.length),
    onError: (failure) => setError(errorMessage(failure)),
  });

  return {
    fileName,
    analysis,
    error,
    committing: save.isPending,
    reset,
    async chooseFile() {
      setError(null);
      try {
        const file = await pickTextFile(CSV_TYPES);
        if (!file) return;
        setFileName(file.name);
        setAnalysis(analyse(file.content));
      } catch (failure) {
        setError(errorMessage(failure));
      }
    },
    // A file with any invalid row is refused as a whole, so a partial import can't be mistaken
    // for a complete one. The problems list says exactly what to correct.
    canCommit: Boolean(analysis && analysis.valid.length > 0 && analysis.problems.length === 0 && analysis.missingColumns.length === 0),
    commit() {
      if (analysis) save.mutate(analysis.valid);
    },
  };
}
