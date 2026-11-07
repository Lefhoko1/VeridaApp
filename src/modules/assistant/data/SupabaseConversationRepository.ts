import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, parseRow, parseRows } from '@/core/supabase/response';

import type { AnswerConfidence, ChatMessage, Conversation } from '../domain/models';
import type { ConversationRepository } from '../domain/repositories';

const conversationSchema = z
  .object({ id: z.string(), title: z.string(), updated_at: z.string() })
  .transform((row): Conversation => ({ id: row.id, title: row.title, updatedAt: row.updated_at }));

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  confidence: z.enum(['verified', 'estimate', 'guidance', 'insufficient_data']).nullable(),
});

export class SupabaseConversationRepository implements ConversationRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('assistant');
  }

  private async userId(): Promise<string> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) throw new AppError('unauthenticated', 'Your session has ended. Please sign in again.');
    return data.session.user.id;
  }

  async list(businessId: string, search?: string): Promise<Conversation[]> {
    let query = this.db.from('conversations').select('id, title, updated_at').eq('business_id', businessId);
    if (search) query = query.ilike('title', `%${search.replace(/[%_]/g, ' ')}%`);
    return parseRows(conversationSchema, await query.order('updated_at', { ascending: false }));
  }

  async messages(conversationId: string): Promise<ChatMessage[]> {
    return parseRows(
      messageSchema,
      await this.db.from('messages').select('id, role, content, confidence').eq('conversation_id', conversationId).order('created_at'),
    );
  }

  async start(businessId: string, title: string): Promise<string> {
    const created = parseRow(
      z.object({ id: z.string() }),
      await this.db
        .from('conversations')
        .insert({ user_id: await this.userId(), business_id: businessId, title })
        .select('id')
        .single(),
    );
    return created.id;
  }

  async addMessage(conversationId: string, role: ChatMessage['role'], content: string, confidence: AnswerConfidence | null): Promise<void> {
    assertSuccess(await this.db.from('messages').insert({ conversation_id: conversationId, role, content, confidence }));
    assertSuccess(await this.db.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId));
  }

  async remove(conversationId: string): Promise<void> {
    assertSuccess(await this.db.from('conversations').delete().eq('id', conversationId));
  }

  async logRequest(entry: { businessId: string; intent: string; outcome: 'answered' | 'insufficient_data' | 'failed'; latencyMs: number }): Promise<void> {
    assertSuccess(
      await this.db.from('request_log').insert({
        user_id: await this.userId(),
        business_id: entry.businessId,
        intent: entry.intent,
        outcome: entry.outcome,
        latency_ms: entry.latencyMs,
      }),
    );
  }
}
