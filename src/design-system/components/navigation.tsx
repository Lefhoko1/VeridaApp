import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { FONT_FAMILY } from '../theme/fonts';
import { palette, supporting } from '../theme/palette';
import { radius, shadows } from '../theme/theme';

const PILL = { width: 52, height: 30 };

// A tab's icon, with a mint pill that grows behind it when the tab is selected.
export function TabIcon({ icon, activeIcon, color, focused, size = 22 }: { icon: string; activeIcon: string; color: string; focused: boolean; size?: number }) {
  const progress = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, { damping: 18, stiffness: 240 });
  }, [focused, progress]);
  const pill = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scaleX: 0.6 + progress.value * 0.4 }] }));
  return (
    <View style={styles.tab}>
      <Animated.View style={[styles.pill, pill]} />
      <Icon source={focused ? activeIcon : icon} size={size} color={color} />
    </View>
  );
}

const headerTitleStyle = { fontFamily: FONT_FAMILY, fontWeight: '700', fontSize: 17 } as const;

// Shared by every stack: a white header with deep teal text, matching the light sidebar of the
// updated design. The tabs add a fine line under it through HeaderBackdrop.
export const brandHeader = {
  headerStyle: { backgroundColor: supporting.white },
  headerTintColor: palette.deepTeal,
  headerTitleStyle,
  headerShadowVisible: false,
} as const;

export const tabBarOptions = {
  tabBarActiveTintColor: palette.deepTeal,
  tabBarInactiveTintColor: supporting.mutedText,
  tabBarLabelStyle: { fontFamily: FONT_FAMILY, fontSize: 11, fontWeight: '600' },
  animation: 'fade',
} as const;

export const tabBarSurface = { backgroundColor: supporting.white, borderTopColor: supporting.line, ...shadows.soft };

const styles = StyleSheet.create({
  tab: { width: PILL.width, height: PILL.height, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: palette.softMint, borderRadius: radius.lg },
});
