import { createContext, useContext } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

// The website switches to a desktop layout on a wide window. The native app, and the website on a
// phone or narrow window, keep the mobile layout, so nothing here changes how the app looks.
export const WIDE_MIN_WIDTH = 1024;
export const pageMaxWidth = 1120;

export function useWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_MIN_WIDTH;
}

// True for a page shown inside the website's sidebar layout, where the sidebar already carries the
// brand, so a page drops its decorative picture.
const ShellContext = createContext(false);
export const ShellProvider = ShellContext.Provider;
export const useInShell = () => useContext(ShellContext);

// True for a picture filling the side of a split screen rather than sitting above the content.
const HeroFillContext = createContext(false);
export const HeroFillProvider = HeroFillContext.Provider;
export const useHeroFill = () => useContext(HeroFillContext);
