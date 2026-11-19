import { router, usePathname, type Href } from 'expo-router';
import type { ReactNode } from 'react';

import { PageHeader, WebShell, type ShellNavItem, type ShellNavSection } from '@/design-system';
import { usePlatformAccess } from '@/modules/administration';
import { useActiveBusiness, useBusinessContext } from '@/modules/business';
import { useUnreadCount } from '@/modules/notifications';

import { goBack } from './navigation';
import { platformEntries } from './platformEntries';

// The website's desktop layout for wide windows. The routes choose it with useWideLayout, so the
// app and the website on a phone keep their tabs and headers.

type HeaderProps = { options: { title?: string }; route: { name: string }; back?: unknown };

// The page title on the website, used as a navigator's header in place of the coloured app header.
export function webHeader(kicker?: string) {
  return function WebHeader({ options, route, back }: HeaderProps) {
    return <PageHeader title={options.title ?? route.name} kicker={kicker} onBack={back ? goBack : undefined} />;
  };
}

const link = (key: string, label: string, icon: string, href: Href, active: string, badge?: number): ShellNavItem => ({
  key,
  label,
  icon,
  active: key === active,
  onPress: () => router.navigate(href),
  badge,
});

// Which sidebar entry a workspace address belongs to, so a sale's page keeps Records highlighted.
const WORKSPACE_SECTIONS: Record<string, string> = {
  overview: 'overview',
  records: 'records',
  sales: 'records',
  expenses: 'records',
  activities: 'records',
  products: 'records',
  flocks: 'records',
  import: 'records',
  insights: 'insights',
  plan: 'plan',
  tasks: 'plan',
  goals: 'plan',
  events: 'plan',
  series: 'plan',
  reviews: 'plan',
  assist: 'plan',
  suggestions: 'plan',
  'plan-settings': 'plan',
  learn: 'learn',
  lessons: 'learn',
  'learning-preferences': 'learn',
  ask: 'ask',
  conversations: 'ask',
  business: 'business',
  account: 'account',
  notifications: 'notifications',
};

export function WorkspaceWebShell({ children }: { children: ReactNode }) {
  const { business, industry } = useActiveBusiness();
  const { hasPlatformRole } = usePlatformAccess();
  const unread = useUnreadCount();
  const active = WORKSPACE_SECTIONS[usePathname().split('/')[1] ?? ''] ?? '';

  const sections: ShellNavSection[] = [
    {
      items: [
        link('overview', 'Overview', 'view-dashboard-outline', '/overview', active),
        link('records', 'Records', 'notebook-edit-outline', '/records', active),
        link('insights', 'Insights', 'chart-box-outline', '/insights', active),
        link('plan', 'Plan', 'calendar-check-outline', '/plan', active),
        link('learn', 'Learn', 'school-outline', '/learn', active),
        link('ask', 'Ask Verida', 'creation-outline', '/ask', active),
      ],
    },
    {
      title: 'Settings',
      items: [
        link('notifications', 'Notifications', 'bell-outline', '/notifications', active, unread),
        link('business', 'My business', 'domain', '/business', active),
        link('account', 'My account', 'account-circle-outline', '/account', active),
        ...(hasPlatformRole ? [link('platform', 'Verida platform', 'shield-account-outline', '/platform', active)] : []),
      ],
    },
  ];

  return (
    <WebShell heading={business.name} caption={industry?.name} sections={sections}>
      {children}
    </WebShell>
  );
}

export function PlatformWebShell({ children }: { children: ReactNode }) {
  const { can } = usePlatformAccess();
  const { status } = useBusinessContext();
  const pathname = usePathname();
  const entries = platformEntries(can);
  // The longest matching address wins, so /admin/users/123 highlights Users.
  const match = entries.filter((entry) => pathname.startsWith(String(entry.href))).sort((a, b) => String(b.href).length - String(a.href).length)[0];
  const active = pathname === '/platform' ? 'home' : (match?.key ?? '');

  const sections: ShellNavSection[] = [
    {
      items: [link('home', 'Overview', 'view-dashboard-outline', '/platform', active), ...entries.map((entry) => link(entry.key, entry.title, entry.icon, entry.href, active))],
    },
  ];
  if (status === 'ready') {
    sections.push({ title: 'My business', items: [link('workspace', 'Open my business', 'arrow-left', '/overview', active)] });
  }

  return (
    <WebShell heading="Verida platform" caption="Staff area" sections={sections}>
      {children}
    </WebShell>
  );
}
