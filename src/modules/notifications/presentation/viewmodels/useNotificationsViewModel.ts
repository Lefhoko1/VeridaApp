import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { errorMessage } from '@/core/errors/AppError';
import { useFeedback } from '@/design-system';

import { DEFAULT_PREFERENCES, type NotificationPreferences, type ToggleablePreference } from '../../domain/models';
import { useNotificationsDependencies } from '../di';

const listKey = ['notifications', 'list'];

// Quiet hours as presets, so there is nothing to type wrongly.
export const QUIET_HOURS = [
  { value: '', label: 'Off' },
  { value: '21:00-06:00', label: '21:00 to 06:00' },
  { value: '22:00-07:00', label: '22:00 to 07:00' },
  { value: '20:00-08:00', label: '20:00 to 08:00' },
];
const preferencesKey = ['notifications', 'preferences'];

export function useUnreadCount(): number {
  const { notifications } = useNotificationsDependencies();
  const list = useQuery({ queryKey: listKey, queryFn: () => notifications.list(), refetchInterval: 60_000 });
  return (list.data ?? []).filter((item) => !item.isRead).length;
}

export function useNotificationsViewModel() {
  const { notifications } = useNotificationsDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();

  const list = useQuery({ queryKey: listKey, queryFn: () => notifications.list() });
  const preferences = useQuery({ queryKey: preferencesKey, queryFn: () => notifications.getPreferences() });

  const refreshList = () => queryClient.invalidateQueries({ queryKey: listKey });
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const markRead = useMutation({ mutationFn: (id: string) => notifications.markRead(id), onSuccess: refreshList, ...report });
  const markAllRead = useMutation({ mutationFn: () => notifications.markAllRead(), onSuccess: refreshList, ...report });
  const remove = useMutation({ mutationFn: (id: string) => notifications.remove(id), onSuccess: refreshList, ...report });
  const savePreferences = useMutation({
    mutationFn: (next: NotificationPreferences) => notifications.savePreferences(next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: preferencesKey }),
    ...report,
  });

  const current = preferences.data ?? DEFAULT_PREFERENCES;

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    refreshing: list.isRefetching,
    refresh: () => void refreshList(),
    items: list.data ?? [],
    hasUnread: (list.data ?? []).some((item) => !item.isRead),
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
    remove: (id: string) => remove.mutate(id),
    preferences: current,
    setPreference(key: ToggleablePreference, value: boolean) {
      savePreferences.mutate({ ...current, [key]: value });
    },
    quietHoursOptions: QUIET_HOURS.some((option) => option.value === (current.quietStart ? `${current.quietStart}-${current.quietEnd}` : ''))
      ? QUIET_HOURS
      : [...QUIET_HOURS, { value: `${current.quietStart}-${current.quietEnd}`, label: `${current.quietStart} to ${current.quietEnd}` }],
    quietHours: current.quietStart ? `${current.quietStart}-${current.quietEnd}` : '',
    setQuietHours(value: string) {
      const [start, end] = value ? value.split('-') : [];
      savePreferences.mutate({ ...current, quietStart: start ?? null, quietEnd: end ?? null });
    },
  };
}
