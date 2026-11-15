import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { supporting } from '../theme/palette';

// The full logo, cropped tight on a transparent background. Its proportions are width ÷ height.
const LOGO = require('../../../assets/brand/logo.png');
const ASPECT = 894 / 679;

// The Verida logo. `size` sets its height in proportion to text of that size. The navy lettering
// needs a light background, so on dark surfaces (`inverse`) it sits on a white badge.
export function BrandLogo({ size = 34, inverse = false }: { size?: number; inverse?: boolean }) {
  const height = Math.round(size * 1.6);
  const mark = (
    <Image source={LOGO} style={{ width: Math.round(height * ASPECT), height }} contentFit="contain" accessible accessibilityRole="image" accessibilityLabel="Verida" />
  );
  if (!inverse) return mark;
  return <View style={[styles.badge, { borderRadius: Math.round(height * 0.22), padding: Math.round(height * 0.14) }]}>{mark}</View>;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', backgroundColor: supporting.white, boxShadow: '0px 6px 18px rgba(21, 60, 70, 0.18)' },
});
