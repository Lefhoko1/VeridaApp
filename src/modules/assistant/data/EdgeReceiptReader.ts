import { FunctionsHttpError } from '@supabase/supabase-js';
import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import type { SupabaseClient } from '@/core/supabase/client';

import type { ReceiptReadingResult } from '../domain/models';

const readingSchema = z.object({
  occurredOn: z.string().nullable(),
  total: z.number().nullable(),
  description: z.string().nullable(),
  vendor: z.string().nullable(),
  category: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unitPrice: z.number().nullable(),
});

// Reads a stored receipt with the AI service. The function opens the file as the signed-in user,
// so only someone who can see the receipt can have it read.
export class EdgeReceiptReader {
  constructor(private readonly client: SupabaseClient) {}

  async read(request: { businessId: string; path: string; kind: 'sale' | 'expense'; categories: string[] }): Promise<ReceiptReadingResult> {
    const { data, error } = await this.client.functions.invoke('read-receipt', { body: request });
    if (error) {
      const status = error instanceof FunctionsHttpError ? error.context.status : null;
      if (status === 503) {
        throw new AppError('unknown', 'Reading receipts needs the AI service, which is not switched on yet. Fill in the form yourself for now.', { cause: error });
      }
      if (status === 422) throw new AppError('validation', 'The AI could not read this receipt. Try a clearer photo, or fill in the form yourself.', { cause: error });
      if (status === 429) throw new AppError('conflict', 'You have used the AI a lot in the last hour. Try again later.', { cause: error });
      throw new AppError('unknown', 'The receipt could not be read. Please try again.', { cause: error });
    }
    const parsed = readingSchema.safeParse(data);
    if (!parsed.success) throw new AppError('unknown', 'The AI service returned an unexpected answer.', { cause: parsed.error });
    return parsed.data;
  }
}
