import { palette, supporting } from './palette';

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const WCAG_AA_TEXT = 4.5;

describe('colour palette', () => {
  it('matches the approved palette exactly', () => {
    expect(palette).toEqual({
      deepTeal: '#153C46',
      teal: '#237C78',
      softMint: '#DCECE7',
      warmIvory: '#F7F6F0',
      mutedCoral: '#E69A7A',
    });
  });

  it.each([
    ['button text on teal', supporting.white, palette.teal],
    ['header text on deep teal', supporting.white, palette.deepTeal],
    ['body text on ivory', supporting.ink, palette.warmIvory],
    ['muted text on ivory', supporting.mutedText, palette.warmIvory],
    ['muted text on white', supporting.mutedText, supporting.white],
    ['brand text on mint', palette.deepTeal, palette.softMint],
    ['coral notice text', supporting.coralText, supporting.coralWash],
    ['success pill', supporting.success, palette.softMint],
    ['warning pill', supporting.amberText, supporting.amberWash],
    ['neutral pill', supporting.neutralText, supporting.neutralWash],
    ['danger pill', supporting.error, supporting.coralWash],
    ['snackbar error', supporting.white, supporting.error],
    ['badge on coral', palette.deepTeal, palette.mutedCoral],
    ['mint text on deep teal', palette.softMint, palette.deepTeal],
    ['information notice', palette.deepTeal, supporting.mintWash],
    ['selected tab on mint', palette.deepTeal, palette.softMint],
    ['header text at the bright end of the gradient', supporting.white, palette.teal],
    ['coral tile icon', supporting.coralText, supporting.coralWash],
    ['eyebrow label', supporting.eyebrowText, supporting.eyebrowWash],
    ['sidebar link', supporting.navText, supporting.white],
    ['sidebar link on hover', supporting.navText, supporting.navHover],
    ['active sidebar link', supporting.eyebrowText, supporting.navActive],
    ['muted text on the page', supporting.mutedText, supporting.pageWash],
    ['user chat bubble', supporting.white, palette.deepTeal],
  ])('%s meets WCAG AA', (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });
});
