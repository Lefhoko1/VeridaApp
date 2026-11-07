import { configureFonts, MD3LightTheme, type MD3Theme } from 'react-native-paper';

import { FONT_FAMILY } from './fonts';
import { palette, supporting } from './palette';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const contentMaxWidth = 720;

// The prototype's hero gradient. Written out because LinearGradient needs a tuple of at least two colours.
export const gradients = {
  brand: [palette.deepTeal, palette.teal],
  bar: ['#2F968E', palette.teal],
  barCoral: ['#F2B79C', palette.mutedCoral],
} as const;

// One soft shadow, from the prototype, so that surfaces lift rather than sit in boxes.
export const shadows = {
  soft: { boxShadow: '0px 6px 20px rgba(21, 60, 70, 0.07)' },
  raised: { boxShadow: '0px 10px 28px rgba(21, 60, 70, 0.14)' },
} as const;

const baseFonts = configureFonts({ config: { fontFamily: FONT_FAMILY } });

const fonts: MD3Theme['fonts'] = {
  ...baseFonts,
  displaySmall: { ...baseFonts.displaySmall, fontWeight: '800', letterSpacing: -0.8 },
  headlineLarge: { ...baseFonts.headlineLarge, fontWeight: '800', letterSpacing: -0.7 },
  headlineMedium: { ...baseFonts.headlineMedium, fontWeight: '800', letterSpacing: -0.6 },
  headlineSmall: { ...baseFonts.headlineSmall, fontWeight: '700', letterSpacing: -0.4 },
  titleLarge: { ...baseFonts.titleLarge, fontWeight: '700', letterSpacing: -0.3 },
  titleMedium: { ...baseFonts.titleMedium, fontWeight: '600', letterSpacing: -0.1 },
  titleSmall: { ...baseFonts.titleSmall, fontWeight: '600', letterSpacing: 0 },
  labelLarge: { ...baseFonts.labelLarge, fontWeight: '600', letterSpacing: 0 },
};

export const veridaTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 3,
  fonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.teal,
    onPrimary: supporting.white,
    primaryContainer: palette.softMint,
    onPrimaryContainer: palette.deepTeal,
    secondary: palette.deepTeal,
    onSecondary: supporting.white,
    secondaryContainer: palette.softMint,
    onSecondaryContainer: palette.deepTeal,
    tertiary: palette.mutedCoral,
    onTertiary: palette.deepTeal,
    tertiaryContainer: supporting.coralWash,
    onTertiaryContainer: supporting.coralText,
    background: palette.warmIvory,
    onBackground: supporting.ink,
    surface: supporting.white,
    onSurface: supporting.ink,
    surfaceVariant: palette.softMint,
    onSurfaceVariant: supporting.mutedText,
    outline: supporting.mintBorder,
    outlineVariant: supporting.line,
    error: supporting.error,
    onError: supporting.white,
    errorContainer: supporting.coralWash,
    onErrorContainer: supporting.coralText,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: 'transparent',
      level1: supporting.white,
      level2: supporting.white,
      level3: supporting.mintWash,
      level4: supporting.mintWash,
      level5: supporting.mintWash,
    },
  },
};
