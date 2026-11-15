// Palette 1: "Verida - Intelligent & Fresh". See docs/requirements/ColorPallet.png.
export const palette = {
  deepTeal: '#153C46', // Sidebar, brand
  teal: '#237C78', // Buttons, links
  softMint: '#DCECE7', // Highlights, cards
  warmIvory: '#F7F6F0', // Background
  mutedCoral: '#E69A7A', // Small accents
} as const;

// Supporting tones from the updated design (Verida_Hero_Image_Right_Updated). They carry text and
// status on top of the palette, where the five brand colours alone would not meet contrast requirements.
export const supporting = {
  white: '#FFFFFF',
  ink: '#182D31',
  mutedText: '#5F7477',
  line: '#E3EBE6',
  // Labels and highlights sit on soft mint, and pages on warm ivory, so the brand palette carries
  // the look. These names say where each colour is used.
  eyebrowWash: palette.softMint,
  eyebrowText: '#17675C',
  pageWash: palette.warmIvory,
  navText: '#506F70',
  navHover: '#F0F6F3',
  navActive: palette.softMint,
  bizWash: '#F0F6F3',
  bizBorder: '#B9D9D1',
  gridLine: '#E5EEE8',
  axisLine: '#CDDFD4',
  mintBorder: '#B9D9D1',
  mintWash: '#F0F6F3',
  coralWash: '#FFF4EC',
  coralText: '#8A4D36',
  amberWash: '#FFF5E3',
  amberText: '#8A5F16',
  neutralWash: '#F0F1EC',
  neutralText: '#5C685F',
  success: '#166534',
  error: '#B3432B',
} as const;
