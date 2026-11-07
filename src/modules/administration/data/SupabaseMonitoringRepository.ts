import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, nullableNumeric, numeric, parseRow, parseRows } from '@/core/supabase/response';

import type { AiRequest, AiUsage, AuditEntry, AuditFilter, ServiceHealth, SystemEvent, UsageStat } from '../domain/models';
import type { MonitoringRepository } from '../domain/repositories';

const statSchema = z.object({ metric: z.string(), label: z.string(), value: numeric }).transform((row): UsageStat => row);

const eventSchema = z
  .object({ id: numeric, source: z.string(), severity: z.enum(['info', 'warning', 'error']), message: z.string(), created_at: z.string() })
  .transform((row): SystemEvent => ({ id: row.id, source: row.source, severity: row.severity, message: row.message, createdAt: row.created_at }));

const auditSchema = z
  .object({
    id: numeric,
    occurred_at: z.string(),
    table_schema: z.string(),
    table_name: z.string(),
    action: z.enum(['INSERT', 'UPDATE', 'DELETE']),
    actor_email: z.string().nullable(),
    changed_fields: z.array(z.string()),
  })
  .transform(
    (row): AuditEntry => ({
      id: row.id,
      occurredAt: row.occurred_at,
      tableSchema: row.table_schema,
      tableName: row.table_name,
      action: row.action,
      actorEmail: row.actor_email,
      changedFields: row.changed_fields,
    }),
  );

const aiRequestSchema = z
  .object({
    id: numeric,
    created_at: z.string(),
    intent: z.string(),
    outcome: z.enum(['answered', 'insufficient_data', 'failed']),
    source: z.enum(['ai', 'rules']),
    latency_ms: nullableNumeric,
    user_email: z.string().nullable(),
    business_name: z.string().nullable(),
  })
  .transform(
    (row): AiRequest => ({
      id: row.id,
      createdAt: row.created_at,
      intent: row.intent,
      outcome: row.outcome,
      source: row.source,
      latencyMs: row.latency_ms,
      userEmail: row.user_email,
      businessName: row.business_name,
    }),
  );

const aiUsageSchema = z
  .object({ requests: numeric, answered: numeric, insufficient_data: numeric, failed: numeric, from_ai: numeric, from_rules: numeric, average_latency_ms: nullableNumeric })
  .transform(
    (row): AiUsage => ({
      requests: row.requests,
      answered: row.answered,
      insufficientData: row.insufficient_data,
      failed: row.failed,
      fromAi: row.from_ai,
      fromRules: row.from_rules,
      averageLatencyMs: row.average_latency_ms,
    }),
  );

export class SupabaseMonitoringRepository implements MonitoringRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('platform');
  }

  async usageStats(): Promise<UsageStat[]> {
    return parseRows(statSchema, await this.db.rpc('admin_usage_stats'));
  }

  async recentEvents(): Promise<SystemEvent[]> {
    return parseRows(eventSchema, await this.db.rpc('admin_recent_events', { p_limit: 50 }));
  }

  private async timed(name: string, check: () => Promise<{ error: unknown; detail?: string | null; notConfigured?: boolean }>): Promise<ServiceHealth> {
    const startedAt = Date.now();
    try {
      const { error, detail, notConfigured } = await check();
      if (error) return { name, status: 'down', latencyMs: null, detail: 'The service did not respond correctly.' };
      return { name, status: notConfigured ? 'not_configured' : 'up', latencyMs: Date.now() - startedAt, detail: detail ?? null };
    } catch {
      return { name, status: 'down', latencyMs: null, detail: 'The service could not be reached.' };
    }
  }

  // FR-I10: measured from here, so it reflects what this device can actually reach.
  async checkServices(): Promise<ServiceHealth[]> {
    return Promise.all([
      this.timed('Database and API', async () => ({ error: (await this.db.rpc('health_ping')).error })),
      this.timed('Authentication', async () => ({ error: (await this.client.auth.getUser()).error })),
      this.timed('AI service', async () => {
        const { data, error } = await this.client.functions.invoke('ask-verida', { body: { ping: true } });
        if (error) return { error: null, notConfigured: true, detail: 'Not deployed. Built-in rules are being used.' };
        const configured = Boolean(data?.ai_configured);
        return { error: null, notConfigured: !configured, detail: configured ? null : 'No API key is set. Built-in rules are being used.' };
      }),
    ]);
  }

  async auditLog(filter: AuditFilter): Promise<AuditEntry[]> {
    return parseRows(
      auditSchema,
      await this.db.rpc('admin_audit_log', {
        p_table: filter.table || null,
        p_action: filter.action || null,
        p_from: filter.from || null,
        p_to: filter.to || null,
      }),
    );
  }

  async aiUsage(from: string, to: string): Promise<AiUsage> {
    return parseRow(aiUsageSchema, await this.client.schema('assistant').rpc('admin_usage', { p_from: from, p_to: to }).single());
  }

  async aiRequests(filter: { outcome?: string; from?: string; to?: string }): Promise<AiRequest[]> {
    return parseRows(
      aiRequestSchema,
      await this.client.schema('assistant').rpc('admin_list_requests', {
        p_outcome: filter.outcome || null,
        p_from: filter.from || null,
        p_to: filter.to || null,
      }),
    );
  }

  async reportError(source: string, message: string): Promise<void> {
    assertSuccess(await this.db.rpc('report_event', { p_source: source, p_severity: 'error', p_message: message }));
  }
}
