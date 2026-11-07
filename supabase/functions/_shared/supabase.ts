import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Projects expose either the newer key sets (JSON objects) or the legacy single keys.
function projectKey(newName: string, legacyName: string): string {
  const keys = Deno.env.get(newName);
  if (keys) {
    const first = Object.values(JSON.parse(keys) as Record<string, string>)[0];
    if (first) return first;
  }
  return Deno.env.get(legacyName) ?? '';
}

const url = () => Deno.env.get('SUPABASE_URL') ?? '';
const options = { auth: { persistSession: false, autoRefreshToken: false } };

// Acts as the signed-in user, so row-level security applies to everything it reads.
export function userClient(req: Request): SupabaseClient {
  return createClient(url(), projectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    ...options,
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

// Bypasses row-level security. Used only for the few writes no client may make directly.
export function serviceClient(): SupabaseClient {
  return createClient(url(), projectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), options);
}

// A function has no stored session, so the token from the request must be passed explicitly.
export async function authenticatedUserId(req: Request, client: SupabaseClient): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
  if (!token) return null;
  const { data } = await client.auth.getUser(token);
  return data.user?.id ?? null;
}

const HOURLY_LIMIT_DEFAULT = 30;

// Stops one account from running up the AI bill.
export async function withinAiQuota(service: SupabaseClient, userId: string): Promise<boolean> {
  const limit = Number(Deno.env.get('AI_HOURLY_LIMIT') ?? HOURLY_LIMIT_DEFAULT);
  const { data, error } = await service.schema('assistant').rpc('ai_requests_last_hour', { p_user: userId });
  if (error) throw new Error(`Could not check the AI quota: ${error.message}`);
  return Number(data) < limit;
}

export async function logAiRequest(
  service: SupabaseClient,
  entry: { userId: string; businessId: string | null; intent: string; outcome: 'answered' | 'insufficient_data' | 'failed'; latencyMs: number },
): Promise<void> {
  await service.schema('assistant').from('request_log').insert({
    user_id: entry.userId,
    business_id: entry.businessId,
    intent: entry.intent,
    outcome: entry.outcome,
    latency_ms: entry.latencyMs,
    source: 'ai',
  });
}

export async function reportEvent(service: SupabaseClient, source: string, message: string): Promise<void> {
  await service.schema('platform').from('system_events').insert({ source, severity: 'error', message: message.slice(0, 1000) });
}
