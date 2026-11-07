import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { palette, supporting } from '../theme/palette';
import { gradients, radius, spacing } from '../theme/theme';

// Motion explains what changed and then gets out of the way: nothing here lasts longer than half a
// second, except the loading pulse and the slow drift of the sign-in picture. Reanimated's entering
// animations and timings already follow the device's reduced motion setting. The repeating ones
// below check it themselves, because a loop has no resting state to jump to.
export const motion = { fast: 180, base: 320, slow: 520, stagger: 55 } as const;

const EASE_OUT = Easing.out(Easing.cubic);
const MAX_STAGGERED = 8;

// The plain preset on purpose: on web, withInitialValues makes Reanimated pin the element with
// position: absolute once the animation ends, which pulls it out of the layout.
export function entrance(index = 0) {
  return FadeInDown.duration(motion.base).delay(Math.min(index, MAX_STAGGERED) * motion.stagger);
}

export const fadeIn = FadeIn.duration(motion.fast);

export function Reveal({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={entrance(index)} style={style}>
      {children}
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> };

// A gentle press response for tappable surfaces. Paper's own controls keep their ripple.
export function PressableScale({ style, children, disabled, onPressIn, onPressOut, ...props }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      style={[style, pressed]}
      onPressIn={(event) => {
        scale.set(withSpring(0.975, { damping: 20, stiffness: 320 }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withSpring(1, { damping: 18, stiffness: 260 }));
        onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

const clamp = (ratio: number) => Math.max(0, Math.min(1, ratio));

// A horizontal fill that grows to its value. The value is also what screen readers get from the label beside it.
export function GrowBar({ ratio, tone = 'teal', height = 8, delay = 0 }: { ratio: number; tone?: 'teal' | 'coral'; height?: number; delay?: number }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withDelay(delay, withTiming(clamp(ratio), { duration: motion.slow, easing: EASE_OUT }));
  }, [delay, ratio, width]);
  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <View style={[styles.track, { height, borderRadius: height }]}>
      <Animated.View style={[styles.fill, fill]}>
        <LinearGradient colors={tone === 'teal' ? gradients.bar : gradients.barCoral} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

// A vertical bar that rises to its height, for charts.
export function GrowColumn({ height, color, delay = 0, width = 14 }: { height: number; color: string; delay?: number; width?: number }) {
  const current = useSharedValue(0);
  useEffect(() => {
    current.value = withDelay(delay, withTiming(height, { duration: motion.slow, easing: EASE_OUT }));
  }, [current, delay, height]);
  const rise = useAnimatedStyle(() => ({ height: current.value }));
  return <Animated.View style={[{ width, backgroundColor: color, borderTopLeftRadius: 5, borderTopRightRadius: 5 }, rise]} />;
}

function usePulse(delay = 0) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 0.7 : 0.45);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: motion.slow }), withTiming(0.45, { duration: motion.slow })), -1));
  }, [delay, opacity, reduced]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

// Placeholder blocks in the shape of the content on its way, so a screen doesn't jump when it arrives.
export function Skeleton({ height = 16, width = '100%', delay = 0, style }: { height?: number; width?: ViewStyle['width']; delay?: number; style?: StyleProp<ViewStyle> }) {
  const pulse = usePulse(delay);
  return <Animated.View style={[styles.skeleton, { height, width }, style, pulse]} />;
}

function TypingDot({ delay }: { delay: number }) {
  const pulse = usePulse(delay);
  return <Animated.View style={[styles.dot, pulse]} />;
}

export function TypingDots({ label }: { label: string }) {
  return (
    <View style={styles.dots} accessible accessibilityLabel={label} accessibilityRole="progressbar">
      <TypingDot delay={0} />
      <TypingDot delay={140} />
      <TypingDot delay={280} />
    </View>
  );
}

// Pulses its children, for the moment the app is starting.
export function Breathe({ children }: { children: ReactNode }) {
  const pulse = usePulse();
  return <Animated.View style={pulse}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  track: { flex: 1, backgroundColor: supporting.neutralWash, overflow: 'hidden' },
  fill: { height: '100%', overflow: 'hidden' },
  skeleton: { backgroundColor: palette.softMint, borderRadius: radius.sm },
  dots: { flexDirection: 'row', gap: spacing.xs + 2, paddingVertical: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.teal },
});
