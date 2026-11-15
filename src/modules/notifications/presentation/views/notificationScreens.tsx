import { StyleSheet, View } from 'react-native';
import { Badge, Divider, IconButton, List, Switch } from 'react-native-paper';

import { formatDate } from '@/core/format/format';
import { Button, EmptyState, ErrorView, LoadingView, Panel, Screen, SectionHeader, palette, spacing, IconTile } from '@/design-system';

import type { AppNotification } from '../../domain/models';
import { useNotificationsViewModel, useUnreadCount } from '../viewmodels/useNotificationsViewModel';

const TYPE_ICON: Record<AppNotification['type'], string> = {
  account: 'account-check-outline',
  invitation: 'account-plus-outline',
  lesson: 'school-outline',
  reminder: 'bell-ring-outline',
  platform: 'shield-account-outline',
  business: 'domain',
};

export function NotificationBell({ onPress }: { onPress: () => void }) {
  const unread = useUnreadCount();
  return (
    <View>
      <IconButton icon="bell-outline" iconColor={palette.deepTeal} onPress={onPress} accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} />
      {unread > 0 ? (
        <Badge size={16} style={styles.badge}>
          {unread}
        </Badge>
      ) : null}
    </View>
  );
}

export function NotificationsScreen() {
  const vm = useNotificationsViewModel();

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;

  return (
    <Screen refreshing={vm.refreshing} onRefresh={vm.refresh}>
      <SectionHeader
        title="Notifications"
        action={
          vm.hasUnread ? (
            <Button compact onPress={vm.markAllRead}>
              Mark all read
            </Button>
          ) : undefined
        }
      />
      {vm.items.length === 0 ? (
        <EmptyState illustration="done" title="You are all caught up." />
      ) : (
        <Panel style={styles.list}>
          {vm.items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={item.title}
                titleStyle={item.isRead ? undefined : styles.unread}
                description={`${item.body}\n${formatDate(item.createdAt.slice(0, 10))}`}
                descriptionNumberOfLines={4}
                onPress={item.isRead ? undefined : () => vm.markRead(item.id)}
                left={() => <IconTile icon={TYPE_ICON[item.type]} />}
                right={() => <IconButton icon="close" size={18} onPress={() => vm.remove(item.id)} accessibilityLabel={`Dismiss ${item.title}`} />}
              />
            </View>
          ))}
        </Panel>
      )}

      <Panel>
        <SectionHeader title="What should we tell you about?" description="Account and invitation messages are always sent." />
        <List.Item title="New lessons" right={() => <Switch value={vm.preferences.lessonPublished} onValueChange={(value) => vm.setPreference('lessonPublished', value)} />} />
        <List.Item title="Learning reminders" right={() => <Switch value={vm.preferences.learningReminders} onValueChange={(value) => vm.setPreference('learningReminders', value)} />} />
        <List.Item title="Business account changes" right={() => <Switch value={vm.preferences.businessUpdates} onValueChange={(value) => vm.setPreference('businessUpdates', value)} />} />
        <List.Item title="Also send these by email" right={() => <Switch value={vm.preferences.emailEnabled} onValueChange={(value) => vm.setPreference('emailEnabled', value)} />} />
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: spacing.xs, right: spacing.xs, backgroundColor: palette.mutedCoral, color: palette.deepTeal },
  list: { padding: spacing.xs, gap: 0 },
  unread: { fontWeight: '700', color: palette.deepTeal },
});
