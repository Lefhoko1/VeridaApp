import { Stack } from 'expo-router';

import { PlatformWebShell, webHeader } from '@/composition/WebShells';
import { brandHeader, supporting, useWideLayout } from '@/design-system';

const SCREEN_TITLES: Record<string, string> = {
  platform: 'Verida platform',
  'review/index': 'Review centre',
  'review/[id]': 'Review lesson',
  'admin/users/index': 'Users',
  'admin/users/[id]': 'User',
  'admin/businesses/index': 'Businesses',
  'admin/businesses/[id]': 'Business',
  'admin/industries/index': 'Business types',
  'admin/categories/new': 'New category',
  'admin/categories/[code]': 'Category',
  'admin/industries/new': 'New business type',
  'admin/industries/[code]': 'Business type',
  'admin/kpis/new': 'New KPI',
  'admin/content/index': 'Learning content',
  'admin/content/new': 'New learning content',
  'admin/content/[id]/index': 'Learning content',
  'admin/content/[id]/edit': 'Edit learning content',
  'admin/roles': 'Roles and permissions',
  'admin/staff/[id]': 'Staff permissions',
  'admin/business-members/[businessId]/[userId]': 'Member permissions',
  'admin/deletions': 'Deletion requests',
  'admin/monitoring': 'Monitoring',
  'admin/audit': 'Audit log',
  'admin/ai': 'AI usage',
};

export default function PlatformLayout() {
  const wide = useWideLayout();

  const stack = (
    <Stack
      screenOptions={{
        ...brandHeader,
        ...(wide ? { header: webHeader('Verida platform') } : null),
        contentStyle: { backgroundColor: supporting.pageWash },
      }}
    >
      {Object.entries(SCREEN_TITLES).map(([name, title]) => (
        <Stack.Screen key={name} name={name} options={{ title }} />
      ))}
    </Stack>
  );

  return wide ? <PlatformWebShell>{stack}</PlatformWebShell> : stack;
}
