import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { AppError } from '../errors/AppError';

const NOT_RETRYABLE = new Set(['forbidden', 'not_found', 'validation', 'conflict', 'unauthenticated']);

type UnexpectedErrorReporter = (error: AppError) => void;

// Expected outcomes such as a refused action are not faults, so only unknown errors are reported.
function reportIfUnexpected(error: unknown, report?: UnexpectedErrorReporter) {
  if (report && error instanceof AppError && error.code === 'unknown') report(error);
}

export function createQueryClient(report?: UnexpectedErrorReporter): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error) => reportIfUnexpected(error, report) }),
    mutationCache: new MutationCache({ onError: (error) => reportIfUnexpected(error, report) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof AppError && NOT_RETRYABLE.has(error.code)) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

// All data belonging to a business sits under one key. A write in one module can refresh
// every dependent screen (FR-E08) without modules needing to know about each other.
export const businessScope = (businessId: string) => ['business', businessId] as const;
