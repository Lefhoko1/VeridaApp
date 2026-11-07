import { useCallback, useState } from 'react';
import type { z } from 'zod';

export type FormErrors<K extends string> = Partial<Record<K, string>>;

// Form state for a ViewModel. Inputs are always strings; the zod schema turns them into the
// typed domain input, so validation rules live in one place: the module's domain layer.
export function useForm<TValues extends Record<string, string>, TOutput>(
  schema: z.ZodType<TOutput>,
  initialValues: TValues,
) {
  const [values, setValues] = useState<TValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors<Extract<keyof TValues, string>>>({});

  const setValue = useCallback((key: Extract<keyof TValues, string>, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  }, []);

  const reset = useCallback((next: TValues) => {
    setValues(next);
    setErrors({});
  }, []);

  // Returns the parsed output, or null after recording a message against each invalid field.
  const validate = useCallback((): TOutput | null => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    const next: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? '');
      next[key] ??= issue.message;
    }
    setErrors(next as FormErrors<Extract<keyof TValues, string>>);
    return null;
  }, [schema, values]);

  return { values, errors, setValue, reset, validate };
}
