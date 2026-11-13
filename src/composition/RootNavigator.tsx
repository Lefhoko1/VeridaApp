import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { BrandLogo, BrandSplash, Breathe, ErrorView, Screen } from '@/design-system';
import { AccountBlockedScreen, useAccountAccess, useEntryChoice, useSession } from '@/modules/account';
import { usePlatformAccess } from '@/modules/administration';
import { useBusinessContext } from '@/modules/business';

// Which area of the app the current user may reach. These guards are for navigation only:
// the actual access control is row-level security in the database.
export function RootNavigator() {
  const { status: sessionStatus, retry: retrySession } = useSession();
  const { status: businessStatus, error, retry } = useBusinessContext();
  const { blockedMessage } = useAccountAccess();
  const platform = usePlatformAccess();
  const entry = useEntryChoice();

  const isSignedIn = sessionStatus === 'signed-in';
  const isResolving = !entry.ready || sessionStatus === 'loading' || (isSignedIn && (businessStatus === 'loading' || platform.loading));

  if (isResolving) {
    return (
      <BrandSplash>
        <StatusBar style="light" />
        <Breathe>
          <BrandLogo size={44} inverse />
        </Breathe>
      </BrandSplash>
    );
  }
  if (sessionStatus === 'unavailable') {
    return (
      <Screen>
        <ErrorView message="We could not check your sign-in. Check your internet connection and try again." onRetry={retrySession} />
      </Screen>
    );
  }
  if (isSignedIn && blockedMessage) return <AccountBlockedScreen message={blockedMessage} />;
  if (isSignedIn && businessStatus === 'error') {
    return (
      <Screen>
        <ErrorView message={error ?? 'We could not load your workspace.'} onRetry={retry} />
      </Screen>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!isSignedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={isSignedIn && businessStatus === 'none'}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={isSignedIn && businessStatus === 'ready'}>
          <Stack.Screen name="(workspace)" />
        </Stack.Protected>
        <Stack.Protected guard={isSignedIn}>
          <Stack.Screen name="team-access" />
        </Stack.Protected>
        {/* Verida staff may have no business of their own. */}
        <Stack.Protected guard={isSignedIn && platform.hasPlatformRole}>
          <Stack.Screen name="(platform)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
