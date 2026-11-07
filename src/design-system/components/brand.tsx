import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

import { palette, supporting } from '../theme/palette';

export function BrandLogo({ size = 34, inverse = false }: { size?: number; inverse?: boolean }) {
  return (
    <Text
      accessibilityLabel="Verida"
      style={[styles.logo, { fontSize: size, lineHeight: size * 1.2, letterSpacing: -size * 0.05, color: inverse ? supporting.white : palette.deepTeal }]}
    >
      verida<Text style={[styles.logo, { fontSize: size, color: palette.mutedCoral }]}>.</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  logo: { fontWeight: '800' },
});
