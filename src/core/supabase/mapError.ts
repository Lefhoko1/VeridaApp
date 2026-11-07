import { AppError } from '../errors/AppError';

type ProviderError = { code?: string; message?: string; status?: number };

const NO_PERMISSION = 'You do not have permission to do this.';
const NO_CONNECTION = 'We could not reach Verida. Check your connection and try again.';

// Messages raised by our own SQL functions are written for users. Generic Postgres
// messages are not, so those are replaced by readable text for their error class.
function fromPostgres(code: string, message: string): AppError | null {
  switch (code) {
    case '42501': {
      const isGeneric = /row-level security|permission denied/i.test(message);
      return new AppError('forbidden', isGeneric ? NO_PERMISSION : message);
    }
    case '23505':
      return new AppError('conflict', /duplicate key/i.test(message) ? 'This already exists.' : message);
    // ON DELETE RESTRICT reports 23001 or 23503 depending on the Postgres version.
    case '23001':
    case '23503':
      return new AppError('conflict', 'This is still used by other records, so it cannot be removed.');
    case '23514':
      return new AppError('validation', /violates check constraint/i.test(message) ? 'Please check the values you entered.' : message);
    case '22023':
    case 'P0001':
      return new AppError('conflict', message);
    case 'P0002':
      return new AppError('not_found', message);
    case 'PGRST116':
      return new AppError('not_found', 'This could not be found.');
    case 'PGRST106':
      return new AppError('unknown', 'A database schema is not exposed. See the setup guide in the README.');
    default:
      return null;
  }
}

export function mapProviderError(error: ProviderError): AppError {
  const message = error.message ?? '';
  const known = error.code ? fromPostgres(error.code, message) : null;
  if (known) return known;
  if (/failed to fetch|network request failed|networkerror/i.test(message)) {
    return new AppError('network', NO_CONNECTION, { cause: error });
  }
  if (error.status === 401) {
    return new AppError('unauthenticated', 'Your session has ended. Please sign in again.', { cause: error });
  }
  return new AppError('unknown', 'Something went wrong. Please try again.', { cause: error });
}
