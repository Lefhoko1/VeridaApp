import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, IconButton, Text } from 'react-native-paper';

import { palette, supporting } from '../theme/palette';
import { radius, spacing } from '../theme/theme';
import { IconTile } from './art';
import { BrandLogo } from './brand';
import { pageMaxWidth, ShellProvider } from './responsive';

export type ShellNavItem = { key: string; label: string; icon: string; active: boolean; onPress: () => void; badge?: number };
export type ShellNavSection = { title?: string; items: ShellNavItem[] };

const SIDEBAR_WIDTH = 250;

// The website's desktop layout, following the updated design: a white sidebar with the brand, the
// current business and the navigation, beside the page. Only used on wide windows on the web.
export function WebShell({ heading, caption, sections, children }: { heading: string; caption?: string; sections: ShellNavSection[]; children: ReactNode }) {
  return (
    <View style={styles.shell}>
      <View style={styles.side} role="navigation">
        <ScrollView contentContainerStyle={styles.sideContent}>
          <View>
            <BrandLogo size={31} />
            <Text style={styles.tagline}>INTELLIGENT BUSINESS</Text>
          </View>
          <View style={styles.bizbox}>
            <IconTile icon="storefront-outline" size={38} />
            <View style={styles.fill}>
              <Text style={styles.bizName} numberOfLines={2}>
                {heading}
              </Text>
              {caption ? <Text style={styles.bizCaption}>{caption}</Text> : null}
            </View>
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
      style={(state) => [styles.navButton, (state as { hovered?: boolean }).hovered && styles.navButtonHover, item.active && styles.navButtonActive]}
    >
      {item.active ? <View style={styles.activeBar} /> : null}
      <Icon source={item.icon} size={19} color={item.active ? supporting.eyebrowText : supporting.navText} />
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

// The top of each page on the website, in place of the app's header: a white bar with where you
// are, then the page title, as in the updated design.
export function PageHeader({ title, kicker, onBack, actions }: { title: string; kicker?: string; onBack?: () => void; actions?: ReactNode }) {
  return (
    <View>
      <View style={styles.topBar}>
        <Text style={styles.crumb} numberOfLines={1}>
          {kicker ? `${kicker}   /   ` : ''}
          <Text style={styles.crumbCurrent}>{title}</Text>
        </Text>
      </View>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          {onBack ? <IconButton icon="arrow-left" iconColor={palette.deepTeal} onPress={onBack} accessibilityLabel="Back" style={styles.back} /> : null}
          <View style={styles.fill}>
            <Text style={styles.title} role="heading" aria-level={1} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {actions}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: supporting.pageWash },
  side: { width: SIDEBAR_WIDTH, backgroundColor: supporting.white, borderRightWidth: 1, borderRightColor: supporting.line },
  sideContent: { flexGrow: 1, paddingVertical: 28, paddingHorizontal: 14, gap: spacing.xl },
  tagline: { color: supporting.mutedText, fontSize: 9, fontWeight: '600', letterSpacing: 1.65, marginTop: 3 },
  bizbox: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, backgroundColor: supporting.bizWash, borderWidth: 1, borderColor: supporting.bizBorder, borderRadius: 13 },
  bizName: { color: palette.deepTeal, fontWeight: '700', fontSize: 13 },
  bizCaption: { color: supporting.mutedText, fontSize: 11, marginTop: 3 },
  section: { gap: 4 },
  sectionTitle: { color: supporting.mutedText, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, paddingHorizontal: 14, marginBottom: 4 },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10 },
  navButtonHover: { backgroundColor: supporting.navHover },
  navButtonActive: { backgroundColor: supporting.navActive },
  activeBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, backgroundColor: palette.mutedCoral },
  navLabel: { flex: 1, color: supporting.navText, fontSize: 13, fontWeight: '600' },
  navLabelActive: { color: supporting.eyebrowText, fontWeight: '700' },
  badge: { minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: palette.mutedCoral, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: palette.deepTeal, fontSize: 11, fontWeight: '700' },
  main: { flex: 1, minWidth: 0 },
  topBar: { height: 76, justifyContent: 'center', paddingHorizontal: 37, backgroundColor: supporting.white, borderBottomWidth: 1, borderBottomColor: supporting.line },
  crumb: { color: supporting.mutedText, fontSize: 12 },
  crumbCurrent: { color: palette.deepTeal, fontWeight: '700' },
  header: { backgroundColor: supporting.pageWash, paddingTop: 34, alignItems: 'center' },
  headerInner: { width: '100%', maxWidth: pageMaxWidth, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { marginLeft: -spacing.sm, borderRadius: radius.md },
  fill: { flex: 1 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -1.35, color: palette.deepTeal },
});
