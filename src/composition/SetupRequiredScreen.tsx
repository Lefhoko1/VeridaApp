import { Text } from 'react-native-paper';

import { Notice, Panel, Screen, SceneHeader } from '@/design-system';

export function SetupRequiredScreen() {
  return (
    <Screen hero={<SceneHeader />}>
      <Panel>
        <Text variant="titleMedium">Connect Verida to Supabase</Text>
        <Text variant="bodyMedium">Copy .env.example to .env.local, add your project URL and publishable key, then restart the development server.</Text>
        <Notice>The app cannot start until EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set.</Notice>
      </Panel>
    </Screen>
  );
}
