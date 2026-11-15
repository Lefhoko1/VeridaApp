import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, supporting } from '../theme/palette';
import { shadows, spacing } from '../theme/theme';
import { BrandLogo } from './brand';
import { Kicker } from './layout';
import { entrance, motion } from './motion';
import { useHeroFill, useWideLayout } from './responsive';

// Original artwork in the Verida palette. Sources are in assets/source. All of it is decorative
// unless a label is passed, so screen readers skip it by default.
const ILLUSTRATIONS = {
  bell: require('../../../assets/illustrations/bell.webp'),
  book: require('../../../assets/illustrations/book.webp'),
  chat: require('../../../assets/illustrations/chat.webp'),
  done: require('../../../assets/illustrations/done.webp'),
  food: require('../../../assets/illustrations/food.webp'),
  growth: require('../../../assets/illustrations/growth.webp'),
  ledger: require('../../../assets/illustrations/ledger.webp'),
  other: require('../../../assets/illustrations/other.webp'),
  people: require('../../../assets/illustrations/people.webp'),
  poultry: require('../../../assets/illustrations/poultry.webp'),
  professional: require('../../../assets/illustrations/professional.webp'),
  retail: require('../../../assets/illustrations/retail.webp'),
  salon: require('../../../assets/illustrations/salon.webp'),
  search: require('../../../assets/illustrations/search.webp'),
} as const;

export type IllustrationName = keyof typeof ILLUSTRATIONS;

export const SCENES = {
  // The updated design's hero photo: business owners across industries.
  owners: require('../../../assets/scenes/business-owners.jpg'),
  savanna: require('../../../assets/scenes/savanna.webp'),
  overview: require('../../../assets/scenes/hero-overview.webp'),
  learn: require('../../../assets/scenes/hero-learn.webp'),
  insights: require('../../../assets/scenes/hero-insights.webp'),
} as const;

export type SceneName = keyof typeof SCENES;

export function Illustration({ name, size = 96, label }: { name: IllustrationName; size?: number; label?: string }) {
  return <Image source={ILLUSTRATIONS[name]} style={{ width: size, height: size }} contentFit="contain" transition={motion.fast} accessible={Boolean(label)} accessibilityLabel={label} />;
}

const TILE_TONES = {
  mint: { background: palette.softMint, color: palette.teal },
  coral: { background: supporting.coralWash, color: supporting.coralText },
  neutral: { background: supporting.neutralWash, color: supporting.neutralText },
} as const;

export type TileTone = keyof typeof TILE_TONES;

// An icon on a soft tile, for rows and status.
export function IconTile({ icon, tone = 'mint', size = 40 }: { icon: string; tone?: TileTone; size?: number }) {
  const colors = TILE_TONES[tone];
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: colors.background }]}>
      <Icon source={icon} size={size * 0.52} color={colors.color} />
    </View>
  );
}

const DRIFT_SCALE = 1.06;
const DRIFT_DURATION = 16000;

function usePictureDrift() {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    scale.value = withRepeat(withTiming(DRIFT_SCALE, { duration: DRIFT_DURATION, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduced, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

const HERO_HEIGHT = { min: 230, ratio: 0.36, max: 380 };

// The full-width picture at the top of screens with no header: sign-in, sign-up and first setup.
// Screen draws its content as a sheet that overlaps the bottom edge.
export function SceneHeader({ scene = 'owners', tagline, children }: { scene?: SceneName; tagline?: string; children?: ReactNode }) {
  const { height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const drift = usePictureDrift();
  const fill = useHeroFill();
  const pictureHeight = Math.min(HERO_HEIGHT.max, Math.max(HERO_HEIGHT.min, height * HERO_HEIGHT.ratio));
  return (
    <View style={[styles.scene, fill ? styles.sceneFill : { height: pictureHeight + top }]}>
      <Animated.View style={[StyleSheet.absoluteFill, drift]}>
        <Image source={SCENES[scene]} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" transition={motion.base} />
      </Animated.View>
      <LinearGradient colors={['rgba(21, 60, 70, 0.55)', 'rgba(21, 60, 70, 0)']} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
      {/* The rest of the app is light with a dark status bar; over this photo's dark top it turns light. */}
      <StatusBar style="light" />
      <View style={[styles.sceneContent, { paddingTop: top + spacing.xl }]}>
        <BrandLogo size={38} inverse />
        {tagline ? <Text style={styles.tagline}>{tagline.toUpperCase()}</Text> : null}
        {children}
      </View>
      {fill ? (
        <View style={styles.sceneLabel}>
          <Text style={styles.sceneLabelText}>A clearer view of your business</Text>
          <Text style={styles.sceneLabelValue}>↗ Grow smarter</Text>
        </View>
      ) : null}
    </View>
  );
}

// The app's first moment, matching the native splash screen (the logo on white) so the two run together.
export function BrandSplash({ children }: { children?: ReactNode }) {
  return (
    <View style={[styles.splash, styles.splashWhite]} accessible accessibilityRole="progressbar" accessibilityLabel="Loading your workspace">
      {children}
    </View>
  );
}

// A white card with the words on one side and the photo on the other, as in the updated design. On a
// wide window the photo sits on the right; on a phone it sits under the words.
export function HeroCard({ kicker, title, body, action, scene = 'owners' }: { kicker: string; title: string; body: string; action?: ReactNode; scene?: SceneName }) {
  const wide = useWideLayout();
  return (
    <Animated.View entering={entrance()} style={styles.heroShadow}>
      <View style={[styles.hero, wide && styles.heroWide]}>
        <View style={[styles.heroContent, wide && styles.heroContentWide]}>
          <Kicker>{`✦ ${kicker}`}</Kicker>
          <Text style={[styles.heroTitle, wide && styles.heroTitleWide]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.heroBody}>{body}</Text>
          {action ? <View style={styles.heroAction}>{action}</View> : null}
        </View>
        <View style={[styles.heroPicture, wide && styles.heroPictureWide]}>
          <Image source={SCENES[scene]} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" transition={motion.base} />
          <View style={styles.heroLabel}>
            <Text style={styles.heroLabelText}>One workspace. More clarity.</Text>
            <Text style={styles.heroLabelValue}>↗ Grow smarter</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// The app's header on a phone: white with a fine line under it, matching the light sidebar on the web.
export function HeaderBackdrop() {
  return <View style={[StyleSheet.absoluteFill, styles.headerBackdrop]} />;
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  heroShadow: { borderRadius: 21, ...shadows.raised },
  hero: { borderRadius: 21, overflow: 'hidden', backgroundColor: supporting.white, borderWidth: 1, borderColor: supporting.line },
  heroWide: { flexDirection: 'row', minHeight: 290 },
  heroContent: { padding: 23, gap: spacing.md },
  heroContentWide: { width: '53%', paddingVertical: 35, paddingHorizontal: 36, justifyContent: 'center' },
  heroTitle: { color: '#142F35', fontSize: 27, lineHeight: 32, fontWeight: '800', letterSpacing: -1.2 },
  heroTitleWide: { fontSize: 36, lineHeight: 41, letterSpacing: -1.6 },
  heroBody: { color: supporting.mutedText, fontSize: 13, lineHeight: 23 },
  heroAction: { marginTop: spacing.xs, alignItems: 'flex-start' },
  heroPicture: { height: 230, backgroundColor: palette.softMint },
  heroPictureWide: { width: '47%', height: 'auto' },
  heroLabel: { position: 'absolute', left: 13, bottom: 13, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 11, backgroundColor: supporting.white, borderWidth: 1, borderColor: supporting.line, boxShadow: '0px 10px 30px rgba(21, 60, 70, 0.12)' },
  heroLabelText: { fontSize: 10, color: supporting.mutedText },
  heroLabelValue: { fontSize: 16, fontWeight: '800', color: palette.teal, marginTop: 4 },
  headerBackdrop: { backgroundColor: supporting.white, borderBottomWidth: 1, borderBottomColor: supporting.line },
  scene: { width: '100%', overflow: 'hidden', backgroundColor: palette.deepTeal },
  sceneFill: { flex: 1 },
  sceneContent: { paddingHorizontal: spacing.xl, gap: spacing.xs },
  sceneLabel: { position: 'absolute', left: 23, bottom: 23, paddingVertical: 15, paddingHorizontal: 19, borderRadius: 13, backgroundColor: supporting.white, boxShadow: '0px 12px 35px rgba(21, 60, 70, 0.14)' },
  sceneLabelText: { fontSize: 11, color: supporting.mutedText },
  sceneLabelValue: { fontSize: 23, fontWeight: '800', color: palette.teal, marginTop: 4 },
  tagline: { fontSize: 11, fontWeight: '600', letterSpacing: 1.2, color: palette.softMint },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  splashWhite: { backgroundColor: supporting.white },
});
