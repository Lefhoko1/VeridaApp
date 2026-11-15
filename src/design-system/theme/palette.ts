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
  eyebrowWash: '#E9F5EF',
  eyebrowText: '#17675C',
  // The signed-in app's light surfaces (Verida_All_Pages_With_Hero_Design).
  pageWash: '#F7FAF8',
  navText: '#506F70',
  navHover: '#EFF7F3',
  navActive: '#E4F3EB',
  bizWash: '#F4F9F6',
  bizBorder: '#E0EBE5',
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
