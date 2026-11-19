import { StyleSheet, View } from 'react-native';
import { Divider, List, Text } from 'react-native-paper';

import { formatDate, toIsoDate } from '@/core/format/format';
import { BarRow, StatusPill, spacing, supporting, type StatusTone } from '@/design-system';

import type { GoalStatus, TaskPriority, TaskStatus } from '../../domain/models';

// Pieces shared by the Plan screens.

export const PRIORITY_TONES: Record<TaskPriority, StatusTone> = { urgent: 'danger', high: 'warn', normal: 'neutral', low: 'neutral' };
export const TASK_TONES: Record<TaskStatus, StatusTone> = { not_started: 'neutral', in_progress: 'warn', blocked: 'danger', completed: 'ok', cancelled: 'neutral' };
export const GOAL_TONES: Record<GoalStatus, StatusTone> = { active: 'ok', on_hold: 'neutral', at_risk: 'warn', completed: 'ok', cancelled: 'neutral', expired: 'neutral' };

export type TaskRowData = {
  id: string;
  title: string;
  priority: TaskPriority;
  priorityLabel: string;
  status: TaskStatus;
  statusLabel: string;
  dueOn: string | null;
  overdue: boolean;
  dueToday: boolean;
  assignee: string | null;
};

export function TaskRows({ items, onOpen, empty }: { items: TaskRowData[]; onOpen: (id: string) => void; empty: string }) {
  if (items.length === 0) return <Text style={partStyles.muted}>{empty}</Text>;
  return (
    <>
      {items.map((task, index) => (
        <View key={task.id}>
          {index > 0 ? <Divider /> : null}
          <List.Item
            title={task.title}
            titleStyle={task.status === 'cancelled' ? partStyles.struck : undefined}
            description={[task.overdue ? `Overdue, due ${formatDate(task.dueOn ?? '')}` : task.dueToday ? 'Due today' : task.dueOn ? `Due ${formatDate(task.dueOn)}` : null, task.assignee]
              .filter(Boolean)
              .join(' · ')}
            descriptionStyle={task.overdue ? partStyles.overdue : undefined}
            onPress={() => onOpen(task.id)}
            right={() => (
              <View style={partStyles.rowEnd}>
                {task.priority === 'urgent' || task.priority === 'high' ? <StatusPill label={task.priorityLabel} tone={PRIORITY_TONES[task.priority]} /> : null}
                {task.status !== 'not_started' ? <StatusPill label={task.statusLabel} tone={TASK_TONES[task.status]} /> : null}
              </View>
            )}
          />
        </View>
      ))}
    </>
  );
}

export type GoalCardData = { id: string; title: string; status: GoalStatus; statusLabel: string; summary: string; ratio: number | null; targetOn: string | null };

export function GoalCards({ items, onOpen }: { items: GoalCardData[]; onOpen: (id: string) => void }) {
  return (
    <>
      {items.map((goal, index) => (
        <View key={goal.id}>
          {index > 0 ? <Divider /> : null}
          <List.Item
            title={goal.title}
            description={[goal.summary, goal.targetOn ? `by ${formatDate(goal.targetOn)}` : null].filter(Boolean).join(' · ')}
            descriptionNumberOfLines={2}
            onPress={() => onOpen(goal.id)}
            right={() => (goal.status !== 'active' ? <StatusPill label={goal.statusLabel} tone={GOAL_TONES[goal.status]} /> : null)}
          />
          {goal.ratio !== null ? <BarRow label="" ratio={goal.ratio} value="" /> : null}
        </View>
      ))}
    </>
  );
}

// A moment in the device's own clock, for reminders, comments and history.
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(toIsoDate(date))}, ${hours}:${minutes}`;
}

export const partStyles = StyleSheet.create({
  muted: { color: supporting.mutedText, fontSize: 12, padding: spacing.xs },
  overdue: { color: supporting.error },
  struck: { textDecorationLine: 'line-through', color: supporting.mutedText },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
