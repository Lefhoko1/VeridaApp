import { z } from 'zod';

import type { KeyValueStore } from '@/core/storage/keyValueStore';

import type { OutboxItem, OutboxScope, PlanOutbox } from '../domain/assist';

const taskInputSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'cancelled']),
  dueOn: z.string().nullable(),
  completionNote: z.string().nullable(),
  blockerReason: z.string().nullable(),
  assignedTo: z.string().nullable(),
  goalIds: z.array(z.string()),
});

const goalInputSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  goalType: z.enum(['measurable', 'milestone']),
  direction: z.enum(['increase', 'decrease', 'maintain', 'threshold']).nullable(),
  unit: z.string().nullable(),
  baselineValue: z.number().nullable(),
  targetValue: z.number().nullable(),
  tolerance: z.number().nullable(),
  kpiCode: z.string().nullable(),
  startOn: z.string(),
  targetOn: z.string().nullable(),
  status: z.enum(['active', 'on_hold', 'at_risk', 'completed', 'cancelled', 'expired']),
  statusReason: z.string().nullable(),
});

const eventInputSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  eventType: z.enum(['meeting', 'delivery', 'appointment', 'deadline', 'other']),
  startsOn: z.string(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  status: z.enum(['scheduled', 'done', 'cancelled']),
});

const itemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), clientId: z.string(), recordedAt: z.string(), input: taskInputSchema, error: z.string().nullable() }),
  z.object({
    kind: z.literal('update'),
    clientId: z.string(),
    recordedAt: z.string(),
    taskId: z.string(),
    taskTitle: z.string(),
    expectedVersion: z.number(),
    base: taskInputSchema,
    input: taskInputSchema,
    conflict: z.boolean(),
    error: z.string().nullable(),
  }),
  z.object({ kind: z.literal('create_goal'), clientId: z.string(), recordedAt: z.string(), input: goalInputSchema, error: z.string().nullable() }),
  z.object({ kind: z.literal('create_event'), clientId: z.string(), recordedAt: z.string(), input: eventInputSchema, error: z.string().nullable() }),
  z.object({
    kind: z.literal('create_milestone'),
    clientId: z.string(),
    recordedAt: z.string(),
    goalId: z.string(),
    goalTitle: z.string(),
    title: z.string(),
    dueOn: z.string().nullable(),
    sortOrder: z.number(),
    error: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('set_milestone'),
    clientId: z.string(),
    recordedAt: z.string(),
    milestoneId: z.string(),
    title: z.string(),
    status: z.enum(['pending', 'completed']),
    error: z.string().nullable(),
  }),
]);

// Section 8: changes made without a connection wait in the device's secure store. Each list
// belongs to one person and one business, so another person signing in on the same device, or
// switching business, never sees or sends them.
export class DevicePlanOutbox implements PlanOutbox {
  constructor(private readonly store: KeyValueStore) {}

  private key({ userId, businessId }: OutboxScope) {
    return `verida.plan.outbox.${userId}.${businessId}`;
  }

  async list(scope: OutboxScope): Promise<OutboxItem[]> {
    const stored = await this.store.getItem(this.key(scope));
    if (!stored) return [];
    try {
      const parsed = z.array(z.unknown()).parse(JSON.parse(stored));
      // A damaged item is dropped rather than block every other change.
      return parsed.flatMap((item) => {
        const result = itemSchema.safeParse(item);
        return result.success ? [result.data] : [];
      });
    } catch {
      return [];
    }
  }

  async put(scope: OutboxScope, item: OutboxItem): Promise<void> {
    const items = (await this.list(scope)).filter((existing) => existing.clientId !== item.clientId);
    await this.store.setItem(this.key(scope), JSON.stringify([...items, item]));
  }

  async remove(scope: OutboxScope, clientId: string): Promise<void> {
    const items = (await this.list(scope)).filter((existing) => existing.clientId !== clientId);
    if (items.length === 0) await this.store.removeItem(this.key(scope));
    else await this.store.setItem(this.key(scope), JSON.stringify(items));
  }
}
