import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, supporting } from '../theme/palette';
import { gradients, radius, shadows, spacing } from '../theme/theme';
import { BrandLogo } from './brand';
import { Kicker } from './layout';
import { entrance, motion } from './motion';

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
export function SceneHeader({ scene = 'savanna', tagline, children }: { scene?: SceneName; tagline?: string; children?: ReactNode }) {
  const { height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const drift = usePictureDrift();
  const pictureHeight = Math.min(HERO_HEIGHT.max, Math.max(HERO_HEIGHT.min, height * HERO_HEIGHT.ratio));
  return (
    <View style={[styles.scene, { height: pictureHeight + top }]}>
      <Animated.View style={[StyleSheet.absoluteFill, drift]}>
        <Image source={SCENES[scene]} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" transition={motion.base} />
      </Animated.View>
      <LinearGradient colors={['rgba(21, 60, 70, 0.55)', 'rgba(21, 60, 70, 0)']} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
      <View style={[styles.sceneContent, { paddingTop: top + spacing.xl }]}>
        <BrandLogo size={38} inverse />
        {tagline ? <Text style={styles.tagline}>{tagline.toUpperCase()}</Text> : null}
        {children}
      </View>
    </View>
  );
}

// The app's first moment, matching the native splash screen so that the two run together.
export function BrandSplash({ children }: { children?: ReactNode }) {
  return (
    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.splash} accessible accessibilityRole="progressbar" accessibilityLabel="Loading your workspace">
      {children}
    </LinearGradient>
  );
}

// The picture sits behind the words, with a dark wash on the words' side that keeps them readable
// whatever the card's height crops the picture to.
export function HeroCard({ kicker, title, body, action, scene = 'overview' }: { kicker: string; title: string; body: string; action?: ReactNode; scene?: SceneName }) {
  return (
    <Animated.View entering={entrance()} style={styles.heroShadow}>
      <View style={styles.hero}>
        <Image source={SCENES[scene]} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="right bottom" transition={motion.base} />
        <LinearGradient colors={['rgba(21, 60, 70, 0.96)', 'rgba(21, 60, 70, 0.8)', 'rgba(21, 60, 70, 0)']} locations={[0, 0.6, 0.95]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <View style={styles.heroContent}>
          <Kicker inverse>{kicker}</Kicker>
          <Text variant="headlineSmall" style={styles.heroTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text variant="bodyMedium" style={styles.heroBody}>
            {body}
          </Text>
          {action ? <View style={styles.heroAction}>{action}</View> : null}
        </View>
      </View>
    </Animated.View>
  );
}

export function HeaderBackdrop() {
  return <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />;
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  heroShadow: { borderRadius: radius.xl, ...shadows.raised },
  hero: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: palette.deepTeal },
  heroContent: { padding: spacing.xl, gap: spacing.sm, maxWidth: '84%' },
  heroTitle: { color: supporting.white },
  heroBody: { color: palette.softMint },
  heroAction: { marginTop: spacing.sm, alignItems: 'flex-start' },
  scene: { width: '100%', overflow: 'hidden', backgroundColor: palette.deepTeal },
  sceneContent: { paddingHorizontal: spacing.xl, gap: spacing.xs },
  tagline: { fontSize: 11, fontWeight: '600', letterSpacing: 1.2, color: palette.softMint },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
});
