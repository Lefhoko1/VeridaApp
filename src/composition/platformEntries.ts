import type { Href } from 'expo-router';

import type { usePlatformAccess } from '@/modules/administration';

export type PlatformEntry = { key: string; title: string; description: string; icon: string; href: Href };

// The staff areas a person may open, used by both the platform hub and the website's sidebar.
// Offering an area is for navigation only: each function checks its own permission in the database.
export function platformEntries(can: ReturnType<typeof usePlatformAccess>['can']): PlatformEntry[] {
  const all: (PlatformEntry | false)[] = [
    can('lessons.review') && { key: 'review', title: 'Review centre', description: 'Lessons waiting for a decision', icon: 'check-decagram-outline', href: '/review' },
    can('users.manage') && { key: 'users', title: 'Users', description: 'Search, suspend and reactivate accounts', icon: 'account-multiple-outline', href: '/admin/users' },
    can('businesses.manage') && { key: 'businesses', title: 'Businesses', description: 'Search, configure and suspend businesses, and manage their teams', icon: 'domain', href: '/admin/businesses' },
    can('deletions.process') && { key: 'deletions', title: 'Deletion requests', description: 'Retention period, cancelling and erasing', icon: 'delete-clock-outline', href: '/admin/deletions' },
    can('configuration.manage') && { key: 'industries', title: 'Business types', description: 'Categories, types, activities and KPIs', icon: 'tune-variant', href: '/admin/industries' },
    can('content.manage') && { key: 'content', title: 'Learning content', description: 'Approved material for lessons', icon: 'book-open-outline', href: '/admin/content' },
    can('roles.manage') && { key: 'roles', title: 'Roles and permissions', description: 'Who can do what', icon: 'shield-account-outline', href: '/admin/roles' },
    can('monitoring.view') && { key: 'monitoring', title: 'Monitoring', description: 'Usage, availability and errors', icon: 'chart-line', href: '/admin/monitoring' },
    can('audit.view') && { key: 'audit', title: 'Audit log', description: 'Changes to records and settings', icon: 'history', href: '/admin/audit' },
    can('ai_logs.view') && { key: 'ai', title: 'AI usage', description: 'Request logs and performance', icon: 'robot-outline', href: '/admin/ai' },
  ];
  return all.filter((entry) => entry !== false);
}
