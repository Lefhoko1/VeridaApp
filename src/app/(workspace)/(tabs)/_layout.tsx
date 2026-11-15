import { router, Tabs } from 'expo-router';
import { View, type ColorValue } from 'react-native';
import { IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { webHeader } from '@/composition/WebShells';
import { brandHeader, HeaderBackdrop, palette, TabIcon, tabBarOptions, tabBarSurface, useWideLayout } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';
import { NotificationBell } from '@/modules/notifications';

const TAB_BAR_HEIGHT = 62;

const tabIcon = (icon: string, activeIcon: string) => {
  function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <TabIcon icon={icon} activeIcon={activeIcon} color={color as string} focused={focused} />;
  }
  return TabBarIcon;
};

function HeaderActions() {
  return (
    <View style={{ flexDirection: 'row' }}>
      <NotificationBell onPress={() => router.push('/notifications')} />
      <IconButton icon="domain" iconColor={palette.deepTeal} accessibilityLabel="My business" onPress={() => router.push('/business')} />
      <IconButton icon="account-circle-outline" iconColor={palette.deepTeal} accessibilityLabel="My account" onPress={() => router.push('/account')} />
    </View>
  );
}

export default function TabsLayout() {
  const { business } = useActiveBusiness();
  const { bottom } = useSafeAreaInsets();
  const wide = useWideLayout();

  return (
    <Tabs
      screenOptions={
        wide
          ? // On a wide window on the web, the sidebar replaces the tab bar and the header's buttons.
            { ...tabBarOptions, header: webHeader(business.name), tabBarStyle: { display: 'none' } }
          : {
              ...brandHeader,
              ...tabBarOptions,
              headerTitle: business.name,
              headerBackground: HeaderBackdrop,
              headerRight: HeaderActions,
              // The default height clips the labels, and an explicit height must include the safe area.
              tabBarStyle: { ...tabBarSurface, height: TAB_BAR_HEIGHT + bottom },
            }
      }
    >
      <Tabs.Screen name="overview" options={{ title: 'Overview', tabBarIcon: tabIcon('view-dashboard-outline', 'view-dashboard') }} />
      <Tabs.Screen name="records" options={{ title: 'Records', tabBarIcon: tabIcon('notebook-edit-outline', 'notebook-edit') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: tabIcon('chart-box-outline', 'chart-box') }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: tabIcon('school-outline', 'school') }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask Verida', tabBarIcon: tabIcon('creation-outline', 'creation') }} />
    </Tabs>
  );
}
