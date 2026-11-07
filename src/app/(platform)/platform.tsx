import { router } from 'expo-router';

import { PlatformHubScreen, usePlatformAccess } from '@/modules/administration';
import { useBusinessContext } from '@/modules/business';

export default function PlatformRoute() {
  const { can } = usePlatformAccess();
  const { status } = useBusinessContext();

  const entries = [
    can('lessons.review') && { title: 'Review centre', description: 'Lessons waiting for a decision', icon: 'check-decagram-outline', onPress: () => router.push('/review') },
    can('users.manage') && { title: 'Users', description: 'Search, suspend and reactivate accounts', icon: 'account-multiple-outline', onPress: () => router.push('/admin/users') },
    can('businesses.manage') && { title: 'Businesses', description: 'Search, configure and suspend businesses, and manage their teams', icon: 'domain', onPress: () => router.push('/admin/businesses') },
    can('deletions.process') && { title: 'Deletion requests', description: 'Retention period, cancelling and erasing', icon: 'delete-clock-outline', onPress: () => router.push('/admin/deletions') },
    can('configuration.manage') && { title: 'Industries', description: 'Categories, activities and KPIs', icon: 'tune-variant', onPress: () => router.push('/admin/industries') },
    can('content.manage') && { title: 'Learning content', description: 'Approved material for lessons', icon: 'book-open-outline', onPress: () => router.push('/admin/content') },
    can('roles.manage') && { title: 'Roles and permissions', description: 'Who can do what', icon: 'shield-account-outline', onPress: () => router.push('/admin/roles') },
    can('monitoring.view') && { title: 'Monitoring', description: 'Usage, availability and errors', icon: 'chart-line', onPress: () => router.push('/admin/monitoring') },
    can('audit.view') && { title: 'Audit log', description: 'Changes to records and settings', icon: 'history', onPress: () => router.push('/admin/audit') },
    can('ai_logs.view') && { title: 'AI usage', description: 'Request logs and performance', icon: 'robot-outline', onPress: () => router.push('/admin/ai') },
  ].filter((entry) => entry !== false);

  return <PlatformHubScreen entries={entries} setupAction={status === 'none' ? () => router.push('/setup') : undefined} workspaceAction={status === 'ready' ? () => router.replace('/overview') : undefined} />;
}
