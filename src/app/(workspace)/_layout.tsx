import { Stack } from 'expo-router';

import { WorkspaceWebShell, webHeader } from '@/composition/WebShells';
import { brandHeader, supporting, useWideLayout } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

const SCREEN_TITLES: Record<string, string> = {
  'sales/new': 'New sale',
  'sales/[id]/index': 'Sale',
  'sales/[id]/edit': 'Edit sale',
  'expenses/new': 'New expense',
  'expenses/[id]/index': 'Expense',
  'expenses/[id]/edit': 'Edit expense',
  'activities/new': 'New activity',
  'tasks/new': 'New task',
  'tasks/[id]/index': 'Task',
  'tasks/[id]/edit': 'Edit task',
  'goals/new': 'New goal',
  'goals/[id]/index': 'Goal',
  'goals/[id]/edit': 'Edit goal',
  'events/new': 'New event',
  'events/[id]/index': 'Event',
  'events/[id]/edit': 'Edit event',
  'series/[id]/index': 'Repeating task',
  'series/[id]/edit': 'Edit repeating task',
  'reviews/[week]/index': 'Weekly review',
  'reviews/[week]/edit': 'Write review',
  'activities/settings': 'Activities you record',
  'activities/[id]/index': 'Activity',
  'activities/[id]/edit': 'Edit activity',
  'products/index': 'Products and services',
  'products/new': 'New product or service',
  'products/[id]/index': 'Product or service',
  'products/[id]/edit': 'Edit product or service',
  'flocks/index': 'My flocks',
  'flocks/new': 'Register a flock',
  'flocks/[id]/index': 'Flock',
  'flocks/[id]/edit': 'Edit flock',
  'business/index': 'My business',
  'business/edit': 'Edit business',
  'business/new': 'New business',
  'business/members': 'Team members',
  'business/member/[userId]': 'Member permissions',
  'business/history': 'Change history',
  'import/sales': 'Import sales',
  'import/expenses': 'Import expenses',
  'import/activity': 'Import activity',
  'account/index': 'My account',
  'account/security': 'Email and password',
  notifications: 'Notifications',
  'lessons/[id]': 'Lesson',
  'learning-preferences': 'Learning preferences',
  'conversations/index': 'Conversations',
  'conversations/[id]': 'Conversation',
};

export default function WorkspaceLayout() {
  const wide = useWideLayout();
  const { business } = useActiveBusiness();

  const stack = (
    <Stack
      screenOptions={{
        ...brandHeader,
        ...(wide ? { header: webHeader(business.name) } : null),
        contentStyle: { backgroundColor: supporting.pageWash },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {Object.entries(SCREEN_TITLES).map(([name, title]) => (
        <Stack.Screen key={name} name={name} options={{ title }} />
      ))}
    </Stack>
  );

  // On a wide window on the web, the pages sit beside a sidebar instead of under tabs.
  return wide ? <WorkspaceWebShell>{stack}</WorkspaceWebShell> : stack;
}
