import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { Surface, Text } from 'react-native-paper';
import Animated from 'react-native-reanimated';

import { palette, supporting } from '../theme/palette';
import { contentMaxWidth, radius, shadows, spacing } from '../theme/theme';
import { entrance } from './motion';
import { HeroFillProvider, pageMaxWidth, useInShell, useWideLayout } from './responsive';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  // A full-width picture above the content, which then sits on it as a rounded sheet.
  hero?: ReactNode;
  // On the website, a form is kept to a comfortable reading width rather than the whole page.
  variant?: 'page' | 'form';
};

export function Screen(props: ScreenProps) {
  const wide = useWideLayout();
  const inShell = useInShell();
  if (!wide) return <MobileScreen {...props} />;
  if (props.hero && !inShell) return <SplitScreen {...props} />;
  // Inside the sidebar layout the sidebar carries the brand, so the decorative picture is dropped.
  return <MobileScreen {...props} hero={undefined} wide />;
}

// The website on a wide window, for pages with a picture and no sidebar, such as sign-in: the
// picture fills one side and the form sits on the other.
function SplitScreen({ children, footer, hero }: ScreenProps) {
  return (
    <View style={[styles.screen, styles.split]}>
      <View style={styles.splitPicture}>
        <HeroFillProvider value>{hero}</HeroFillProvider>
      </View>
      <View style={styles.fill}>
        <ScrollView contentContainerStyle={styles.splitScroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.content, styles.splitContent]}>{children}</View>
        </ScrollView>
        {footer}
      </View>
    </View>
  );
}

function MobileScreen({ children, scroll = true, refreshing = false, onRefresh, footer, hero, variant, wide = false }: ScreenProps & { wide?: boolean }) {
  const body = <View style={[styles.content, wide && styles.wideContent, wide && variant === 'form' && styles.formContent]}>{children}</View>;
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={hero ? styles.scrollWithHero : styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.teal} /> : undefined}
        >
          {hero}
          {hero ? <View style={styles.sheet}>{body}</View> : body}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, styles.fill]}>{body}</View>
      )}
      {footer}
    </KeyboardAvoidingView>
  );
}

export function Panel({ children, style, tone = 'plain' }: { children: ReactNode; style?: ViewStyle; tone?: 'plain' | 'mint' }) {
  return (
    <Animated.View entering={entrance()}>
      <Surface mode="flat" style={[styles.panel, tone === 'mint' && styles.panelMint, style]}>
        {children}
      </Surface>
    </Animated.View>
  );
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.fill}>
        <Text variant="titleMedium" style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {description ? (
          <Text variant="bodySmall" style={styles.muted}>
            {description}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function Row({ children, gap = spacing.md, wrap = false }: { children: ReactNode; gap?: number; wrap?: boolean }) {
  return <View style={[styles.row, { gap }, wrap && styles.wrap]}>{children}</View>;
}

export function Stack({ children, gap = spacing.md }: { children: ReactNode; gap?: number }) {
  return <View style={{ gap }}>{children}</View>;
}

export function Kicker({ children, inverse = false }: { children: string; inverse?: boolean }) {
  return <Text style={[styles.kicker, inverse && styles.kickerInverse]}>{children.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.warmIvory },
  scroll: { flexGrow: 1, alignItems: 'center', paddingBottom: spacing.xxl * 2 },
  scrollWithHero: { flexGrow: 1 },
  sheet: {
    flexGrow: 1,
    alignItems: 'center',
    marginTop: -radius.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    backgroundColor: palette.warmIvory,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
  },
  content: { width: '100%', maxWidth: contentMaxWidth, padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  wideContent: { maxWidth: pageMaxWidth, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  formContent: { maxWidth: 820, alignSelf: 'flex-start' },
  split: { flexDirection: 'row' },
  splitPicture: { flex: 1, maxWidth: 640 },
  splitScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xxl },
  splitContent: { maxWidth: 480, flexGrow: 0 },
  fill: { flex: 1 },
  panel: {
    backgroundColor: supporting.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: supporting.line,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.soft,
  },
  panelMint: { backgroundColor: supporting.mintWash, borderColor: supporting.mintBorder },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionTitle: { color: palette.deepTeal },
  muted: { color: supporting.mutedText },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3, color: palette.teal },
  kickerInverse: { color: palette.softMint },
});
