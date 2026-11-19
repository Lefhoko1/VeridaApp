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
