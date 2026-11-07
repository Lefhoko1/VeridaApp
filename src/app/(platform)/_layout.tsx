import { Stack } from 'expo-router';

import { brandHeader, palette } from '@/design-system';

const SCREEN_TITLES: Record<string, string> = {
  platform: 'Verida platform',
  'review/index': 'Review centre',
  'review/[id]': 'Review lesson',
  'admin/users/index': 'Users',
  'admin/users/[id]': 'User',
  'admin/businesses/index': 'Businesses',
  'admin/businesses/[id]': 'Business',
  'admin/industries/index': 'Industries',
  'admin/industries/new': 'New industry',
  'admin/industries/[code]': 'Industry',
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
  return (
    <Stack
      screenOptions={{
        ...brandHeader,
        contentStyle: { backgroundColor: palette.warmIvory },
      }}
    >
      {Object.entries(SCREEN_TITLES).map(([name, title]) => (
        <Stack.Screen key={name} name={name} options={{ title }} />
      ))}
    </Stack>
  );
}
