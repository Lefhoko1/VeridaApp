import { AppProviders } from '@/composition/AppProviders';
import { RootNavigator } from '@/composition/RootNavigator';

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
