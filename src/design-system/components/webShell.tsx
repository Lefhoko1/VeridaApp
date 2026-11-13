import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, IconButton, Text } from 'react-native-paper';

import { palette, supporting } from '../theme/palette';
import { radius, spacing } from '../theme/theme';
import { BrandLogo } from './brand';
import { Kicker } from './layout';
import { pageMaxWidth, ShellProvider } from './responsive';

export type ShellNavItem = { key: string; label: string; icon: string; active: boolean; onPress: () => void; badge?: number };
export type ShellNavSection = { title?: string; items: ShellNavItem[] };

const SIDEBAR_WIDTH = 250;

// The website's desktop layout, following the prototype: a deep teal sidebar with the brand, the
// current business and the navigation, beside the page. Only used on wide windows on the web.
export function WebShell({ heading, caption, sections, children }: { heading: string; caption?: string; sections: ShellNavSection[]; children: ReactNode }) {
  return (
    <View style={styles.shell}>
      <View style={styles.side} role="navigation">
        <ScrollView contentContainerStyle={styles.sideContent}>
          <View>
            <BrandLogo size={29} inverse />
            <Text style={styles.tagline}>YOUR INTELLIGENT BUSINESS COMPANION</Text>
          </View>
          <View style={styles.bizbox}>
            <Text style={styles.bizName} numberOfLines={2}>
              {heading}
            </Text>
            {caption ? <Text style={styles.bizCaption}>{caption}</Text> : null}
          </View>
          {sections.map((section, index) => (
            <View key={section.title ?? index} style={styles.section}>
              {section.title ? <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text> : null}
              {section.items.map((item) => (
                <NavButton key={item.key} item={item} />
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
      <View style={styles.main} role="main">
        <ShellProvider value>{children}</ShellProvider>
      </View>
    </View>
  );
}

function NavButton({ item }: { item: ShellNavItem }) {
  return (
    <Pressable
      onPress={item.onPress}
      role="link"
      aria-current={item.active ? 'page' : undefined}
      accessibilityLabel={item.badge ? `${item.label}, ${item.badge} unread` : item.label}
      style={(state) => [styles.navButton, (item.active || (state as { hovered?: boolean }).hovered) && styles.navButtonActive]}
    >
      {item.active ? <View style={styles.activeBar} /> : null}
      <Icon source={item.icon} size={19} color={item.active ? supporting.white : palette.softMint} />
      <Text style={[styles.navLabel, item.active && styles.navLabelActive]} numberOfLines={1}>
        {item.label}
      </Text>
      {item.badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// The title area at the top of each page on the website, in place of the app's coloured header.
export function PageHeader({ title, kicker, onBack, actions }: { title: string; kicker?: string; onBack?: () => void; actions?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        {onBack ? <IconButton icon="arrow-left" iconColor={palette.deepTeal} onPress={onBack} accessibilityLabel="Back" style={styles.back} /> : null}
        <View style={styles.fill}>
          {kicker ? <Kicker>{kicker}</Kicker> : null}
          <Text style={styles.title} role="heading" aria-level={1} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {actions}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: palette.warmIvory },
  side: { width: SIDEBAR_WIDTH, backgroundColor: palette.deepTeal },
  sideContent: { flexGrow: 1, paddingVertical: 25, paddingHorizontal: 17, gap: spacing.xl },
  tagline: { color: palette.softMint, fontSize: 10, letterSpacing: 1.2, marginTop: 2 },
  bizbox: { padding: 13, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', borderRadius: 13, gap: 2 },
  bizName: { color: supporting.white, fontWeight: '700' },
  bizCaption: { color: palette.softMint, fontSize: 12 },
  section: { gap: 5 },
  sectionTitle: { color: '#B8D0C7', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: 12, marginBottom: 2 },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 9 },
  navButtonActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  activeBar: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: palette.mutedCoral },
  navLabel: { flex: 1, color: palette.softMint, fontSize: 14 },
  navLabelActive: { color: supporting.white, fontWeight: '600' },
  badge: { minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: palette.mutedCoral, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: palette.deepTeal, fontSize: 11, fontWeight: '700' },
  main: { flex: 1, minWidth: 0 },
  header: { backgroundColor: palette.warmIvory, paddingTop: 28, alignItems: 'center' },
  headerInner: { width: '100%', maxWidth: pageMaxWidth, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { marginLeft: -spacing.sm, borderRadius: radius.md },
  fill: { flex: 1 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.8, color: supporting.ink },
});
