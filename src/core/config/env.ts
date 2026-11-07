import { z } from 'zod';

const supabaseConfigSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

export type SupabaseConfig = z.infer<typeof supabaseConfigSchema>;

// Returns null rather than throwing so the app can explain the missing setup on screen.
export function readSupabaseConfig(): SupabaseConfig | null {
  // Metro inlines these only when they are referenced by their full static names.
  const result = supabaseConfigSchema.safeParse({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return result.success ? result.data : null;
}
