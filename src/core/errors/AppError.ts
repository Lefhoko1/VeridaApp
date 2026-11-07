export type AppErrorCode =
  | 'network'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'unknown';

// The one error type that crosses layers, so ViewModels never see provider-specific errors.
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
  }
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError('unknown', FALLBACK_MESSAGE, { cause: error });
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}
