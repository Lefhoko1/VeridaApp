import { useFonts } from 'expo-font';

export const FONT_FAMILY = 'Inter';

// Inter is the prototype's typeface. Each face is required by path, because the package's index
// would bundle all eighteen. One family with several faces lets fontWeight choose between them.
const FACES = [
  { path: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'), weight: 400 },
  { path: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'), weight: 500 },
  { path: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'), weight: 600 },
  { path: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'), weight: 700 },
  { path: require('@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf'), weight: 800 },
];

// True once the app can render: a font that fails to load falls back to the system font rather
// than keeping the person out of the app.
export function useBrandFonts(): boolean {
  const [loaded, error] = useFonts([{ fontFamily: FONT_FAMILY, fontDefinitions: FACES }]);
  return loaded || error !== null;
}
