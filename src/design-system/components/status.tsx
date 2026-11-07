import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import Animated from 'react-native-reanimated';

import { palette, supporting } from '../theme/palette';
import { radius, spacing } from '../theme/theme';
import { Illustration, type IllustrationName } from './art';
import { Button } from './button';
import { entrance, Skeleton } from './motion';

export type StatusTone = 'ok' | 'warn' | 'neutral' | 'danger';

const TONES: Record<StatusTone, { background: string; color: string }> = {
  ok: { background: palette.softMint, color: supporting.success },
  warn: { background: supporting.amberWash, color: supporting.amberText },
  neutral: { background: supporting.neutralWash, color: supporting.neutralText },
  danger: { background: supporting.coralWash, color: supporting.error },
};

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  const colors = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: colors.background }]}>
      <Text style={[styles.pillText, { color: colors.color }]}>{label}</Text>
    </View>
  );
}

const NOTICE_TONES = {
  warn: { background: supporting.coralWash, color: supporting.coralText, icon: 'alert-circle-outline' },
  info: { background: supporting.mintWash, color: palette.deepTeal, icon: 'information-outline' },
} as const;

// warn asks for attention and is announced straight away. info is quiet guidance, such as a disclaimer.
export function Notice({ children, title, tone = 'warn' }: { children: ReactNode; title?: string; tone?: keyof typeof NOTICE_TONES }) {
  const colors = NOTICE_TONES[tone];
  return (
    <View style={[styles.notice, { backgroundColor: colors.background }]} accessibilityRole={tone === 'warn' ? 'alert' : undefined}>
      <Icon source={colors.icon} size={18} color={colors.color} />
      <View style={styles.noticeBody}>
        {title ? <Text style={[styles.noticeTitle, { color: colors.color }]}>{title}</Text> : null}
        <Text style={[styles.noticeText, { color: colors.color }]}>{children}</Text>
      </View>
    </View>
  );
}

// Content is on its way: placeholder rows rather than a spinner, so the screen doesn't jump.
export function LoadingView({ label }: { label?: string }) {
  return (
    <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      <Skeleton height={88} style={styles.loadingBlock} />
      <Skeleton height={18} width="60%" delay={120} />
      <Skeleton height={18} delay={240} />
      <Skeleton height={18} width="80%" delay={360} />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centered}>
      <Icon source="alert-circle-outline" size={32} color={supporting.error} />
      <Text variant="bodyMedium" style={styles.stateText}>
        {message}
      </Text>
      {onRetry ? (
        <Button mode="outlined" onPress={onRetry}>
          Try again
        </Button>
      ) : null}
    </View>
  );
}

type EmptyStateProps = { illustration?: IllustrationName; icon?: string; title: string; description?: string; action?: ReactNode };

export function EmptyState({ illustration, icon, title, description, action }: EmptyStateProps) {
  return (
    <Animated.View entering={entrance()} style={styles.empty}>
      {illustration ? <Illustration name={illustration} size={112} /> : icon ? <Icon source={icon} size={28} color={palette.teal} /> : null}
      <Text variant="titleSmall" style={styles.emptyTitle}>
        {title}
      </Text>
      {description ? (
        <Text variant="bodySmall" style={styles.stateText}>
          {description}
        </Text>
      ) : null}
      {action}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs, borderRadius: 99, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, lineHeight: 15, fontWeight: '700' },
  notice: { flexDirection: 'row', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  noticeBody: { flex: 1, gap: spacing.xs },
  noticeTitle: { fontWeight: '700', fontSize: 13 },
  noticeText: { fontSize: 12, lineHeight: 18 },
  loading: { paddingVertical: spacing.lg, gap: spacing.md, width: '100%' },
  loadingBlock: { borderRadius: radius.lg, marginBottom: spacing.sm },
  centered: { padding: spacing.xxl, alignItems: 'center', justifyContent: 'center', gap: spacing.md, flexGrow: 1 },
  stateText: { textAlign: 'center', color: supporting.mutedText },
  empty: { paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { color: palette.deepTeal, textAlign: 'center' },
});
