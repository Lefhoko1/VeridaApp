import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useOnForeground } from '@/core/app/useOnForeground';
import { AppError, errorMessage } from '@/core/errors/AppError';
import { businessScope } from '@/core/query/queryClient';
import { useActiveBusiness } from '@/modules/business';

import { describeOutboxItem, mergeOntoLatest, type OutboxItem } from '../../domain/assist';
import type { GoalInput, Milestone, Task, TaskInput } from '../../domain/models';
import type { EventInput } from '../../domain/schedule';
import { usePlanDependencies } from '../di';

const RETRY_MS = 30_000;

// One sync at a time across the whole app. Several screens use this hook at once (the Plan tab
// stays open behind a task), and two sending the same change together would report a false conflict.
let flushing = false;

const toInput = (task: Task): TaskInput => ({
  title: task.title,
  description: task.description,
  priority: task.priority,
  status: task.status,
  dueOn: task.dueOn,
  completionNote: task.completionNote,
  blockerReason: task.blockerReason,
  assignedTo: task.assignedTo,
  goalIds: task.goalIds,
});

export const isOffline = (error: unknown) => error instanceof AppError && error.code === 'network';

// A random id the database uses to recognise a task sent twice (section 8).
export function newClientId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Section 8: task changes made without a connection wait on this device and are sent when it
// returns. Creating twice makes one task. A change to a task someone else changed meanwhile is
// never applied silently: the person chooses, and a completion is never lost.
export function usePlanSync() {
  const { plan, outbox } = usePlanDependencies();
  const { business, userId } = useActiveBusiness();
  const queryClient = useQueryClient();
  const scope = userId ? { userId, businessId: business.id } : null;
  const key = [...businessScope(business.id), 'plan-outbox', userId];
  const items = useQuery({ queryKey: key, queryFn: () => (scope ? outbox.list(scope) : Promise.resolve([] as OutboxItem[])), enabled: Boolean(scope) });
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const scopeKey = scope ? `${scope.userId}.${scope.businessId}` : '';

  const refresh = useCallback(async (synced: boolean) => {
    await queryClient.invalidateQueries({ queryKey: key });
    if (synced) await queryClient.invalidateQueries({ queryKey: [...businessScope(business.id), 'plan'] });
    // key changes only with the scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, scopeKey, business.id]);

  const flush = useCallback(async () => {
    if (!scope || flushing) return;
    flushing = true;
    setSyncing(true);
    let synced = false;
    try {
      for (const item of await outbox.list(scope)) {
        if (item.kind === 'update' && item.conflict) continue;
        try {
          switch (item.kind) {
            case 'create':
              await plan.createTask(scope.businessId, item.input, { clientId: item.clientId, recordedAt: item.recordedAt });
              break;
            case 'update':
              await plan.updateTask(scope.businessId, item.taskId, item.input, item.expectedVersion);
              break;
            case 'create_goal':
              await plan.createGoal(scope.businessId, item.input, { clientId: item.clientId });
              break;
            case 'create_event':
              await plan.createEvent(scope.businessId, item.input, { clientId: item.clientId });
              break;
            case 'create_milestone':
              await plan.addMilestone(scope.businessId, item.goalId, { title: item.title, dueOn: item.dueOn, sortOrder: item.sortOrder, clientId: item.clientId });
              break;
            case 'set_milestone':
              // Ticking a milestone is the same whichever device says it last.
              await plan.setMilestoneStatus(item.milestoneId, item.status);
              break;
          }
          await outbox.remove(scope, item.clientId);
          synced = true;
        } catch (error) {
          if (isOffline(error)) {
            setOffline(true);
            return;
          }
          if (item.kind === 'update' && error instanceof AppError && error.code === 'conflict') {
            await outbox.put(scope, { ...item, conflict: true, error: null });
          } else {
            await outbox.put(scope, { ...item, error: errorMessage(error) });
          }
        }
      }
      setOffline(false);
    } finally {
      flushing = false;
      setSyncing(false);
      await refresh(synced);
    }
    // scope is rebuilt from scopeKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, outbox, scopeKey, refresh]);

  // Sends waiting changes on opening, when the app comes back to the front, and every 30 seconds.
  useEffect(() => {
    const first = setTimeout(() => void flush(), 0);
    const timer = setInterval(() => void flush(), RETRY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [flush]);
  useOnForeground(useCallback(() => void flush(), [flush]));

  return {
    offline,
    syncing,
    pending: (items.data ?? []).map((item) => ({ ...describeOutboxItem(item), clientId: item.clientId, conflict: item.kind === 'update' && item.conflict, error: item.error })),
    syncNow: () => void flush(),
    async enqueueCreate(input: TaskInput) {
      if (!scope) return;
      await outbox.put(scope, { kind: 'create', clientId: newClientId(), recordedAt: new Date().toISOString(), input, error: null });
      setOffline(true);
      await refresh(false);
    },
    async enqueueUpdate(task: Task, input: TaskInput) {
      if (!scope) return;
      await outbox.put(scope, {
        kind: 'update',
        clientId: `update-${task.id}`,
        recordedAt: new Date().toISOString(),
        taskId: task.id,
        taskTitle: task.title,
        expectedVersion: task.version,
        base: toInput(task),
        input,
        conflict: false,
        error: null,
      });
      setOffline(true);
      await refresh(false);
    },
    async enqueueGoal(input: GoalInput) {
      if (!scope) return;
      await outbox.put(scope, { kind: 'create_goal', clientId: newClientId(), recordedAt: new Date().toISOString(), input, error: null });
      setOffline(true);
      await refresh(false);
    },
    async enqueueEvent(input: EventInput) {
      if (!scope) return;
      await outbox.put(scope, { kind: 'create_event', clientId: newClientId(), recordedAt: new Date().toISOString(), input, error: null });
      setOffline(true);
      await refresh(false);
    },
    async enqueueMilestone(goal: { id: string; title: string }, milestone: { title: string; dueOn: string | null; sortOrder: number }) {
      if (!scope) return;
      await outbox.put(scope, { kind: 'create_milestone', clientId: newClientId(), recordedAt: new Date().toISOString(), goalId: goal.id, goalTitle: goal.title, ...milestone, error: null });
      setOffline(true);
      await refresh(false);
    },
    async enqueueMilestoneStatus(milestone: Pick<Milestone, 'id' | 'title'>, status: Milestone['status']) {
      if (!scope) return;
      await outbox.put(scope, { kind: 'set_milestone', clientId: `milestone-${milestone.id}`, recordedAt: new Date().toISOString(), milestoneId: milestone.id, title: milestone.title, status, error: null });
      setOffline(true);
      await refresh(false);
    },
    // Keeps this device's change on top of the latest version, such as a completion made offline.
    async keepMine(clientId: string) {
      if (!scope) return;
      const item = (await outbox.list(scope)).find((entry) => entry.clientId === clientId);
      if (!item || item.kind !== 'update') return;
      const latest = await plan.getTask(item.taskId);
      const input = mergeOntoLatest(item.base, item.input, toInput(latest));
      await outbox.put(scope, { ...item, base: toInput(latest), input, expectedVersion: latest.version, conflict: false, error: null });
      await flush();
    },
    async discard(clientId: string) {
      if (!scope) return;
      await outbox.remove(scope, clientId);
      await refresh(true);
    },
  };
}

export type PlanSync = ReturnType<typeof usePlanSync>;
