import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { errorMessage } from '@/core/errors/AppError';
import { useFeedback } from '@/design-system';

import { DEFAULT_PREFERENCES, type NotificationPreferences } from '../../domain/models';
import { useNotificationsDependencies } from '../di';

const listKey = ['notifications', 'list'];
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
    setPreference(key: keyof NotificationPreferences, value: boolean) {
      savePreferences.mutate({ ...current, [key]: value });
    },
  };
}
