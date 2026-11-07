import { z } from 'zod';

import { AppError } from '../errors/AppError';
import { mapProviderError } from './mapError';

type ProviderResponse<T> = {
  data: T | null;
  error: { code?: string; message?: string; status?: number } | null;
};

// Postgres numeric can reach the client as a string, depending on how it is selected.
export const numeric = z.coerce.number();
export const nullableNumeric = z.coerce.number().nullable();

function failIfError<T>(response: ProviderResponse<T>): T | null {
  if (response.error) throw mapProviderError(response.error);
  return response.data;
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('unknown', 'We received an unexpected response. Please try again.', { cause: result.error });
  }
  return result.data;
}

// Every row is validated on arrival, so the rest of the app can trust its types at runtime.
export function parseRows<S extends z.ZodType>(schema: S, response: ProviderResponse<unknown>): z.output<S>[] {
  return parse(z.array(schema), failIfError(response) ?? []);
}

export function parseRow<S extends z.ZodType>(schema: S, response: ProviderResponse<unknown>): z.output<S> {
  const data = failIfError(response);
  if (data === null) throw new AppError('not_found', 'This could not be found.');
  return parse(schema, data);
}

export function parseOptionalRow<S extends z.ZodType>(schema: S, response: ProviderResponse<unknown>): z.output<S> | null {
  const data = failIfError(response);
  return data === null ? null : parse(schema, data);
}

export function assertSuccess(response: { error: ProviderResponse<unknown>['error'] }): void {
  if (response.error) throw mapProviderError(response.error);
}
