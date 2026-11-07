// Palette 1: "Verida - Intelligent & Fresh". See docs/requirements/ColorPallet.png.
export const palette = {
  deepTeal: '#153C46', // Sidebar, brand
  teal: '#237C78', // Buttons, links
  softMint: '#DCECE7', // Highlights, cards
  warmIvory: '#F7F6F0', // Background
  mutedCoral: '#E69A7A', // Small accents
} as const;

// Supporting tones taken from the prototype. They carry text and status on top of the palette,
// where the five brand colours alone would not meet contrast requirements.
export const supporting = {
  white: '#FFFFFF',
  ink: '#111827',
  mutedText: '#53616A',
  line: '#E7E6DE',
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
