import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, type ReactNode } from 'react';
import { PaperProvider } from 'react-native-paper';

import { readSupabaseConfig, type SupabaseConfig } from '@/core/config/env';
import { createQueryClient } from '@/core/query/queryClient';
import { createSupabaseClient } from '@/core/supabase/client';
import { FeedbackProvider, useBrandFonts, veridaTheme } from '@/design-system';
import { AccountDependenciesProvider, EntryChoiceProvider, SessionProvider } from '@/modules/account';
import { AdministrationDependenciesProvider } from '@/modules/administration';
import { AnalyticsDependenciesProvider } from '@/modules/analytics';
import { AssistantDependenciesProvider } from '@/modules/assistant';
import { ActiveBusinessProvider, BusinessDependenciesProvider } from '@/modules/business';
import { LearningDependenciesProvider } from '@/modules/learning';
import { NotificationsDependenciesProvider } from '@/modules/notifications';
import { OperationsDependenciesProvider } from '@/modules/operations';
import { PlanDependenciesProvider } from '@/modules/plan';
import { RecordsDependenciesProvider } from '@/modules/records';

import { createAppDependencies } from './createAppDependencies';
import { SetupRequiredScreen } from './SetupRequiredScreen';

// Keeps the splash screen up until the first screen can draw in its own typeface.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const paperSettings = {
  icon: (props: { name: string; color?: string; size: number }) => (
    <MaterialCommunityIcons name={props.name as keyof typeof MaterialCommunityIcons.glyphMap} color={props.color} size={props.size} />
  ),
};

function ThemedApp({ children }: { children: ReactNode }) {
  return (
    <PaperProvider theme={veridaTheme} settings={paperSettings}>
      <FeedbackProvider>{children}</FeedbackProvider>
    </PaperProvider>
  );
}

// The composition root: the one place that chooses concrete implementations for each module.
function ConfiguredProviders({ config, children }: { config: SupabaseConfig; children: ReactNode }) {
  const [deps] = useState(() => createAppDependencies(createSupabaseClient(config)));
  // FR-I10: unexpected errors reach the monitoring screen. Reporting must never cause an error itself.
  const [queryClient] = useState(() =>
    createQueryClient((error) => {
      const detail = error.cause instanceof Error ? error.cause.message : error.message;
      void deps.administration.monitoring.reportError('app', detail).catch(() => undefined);
    }),
  );

  // Paper's portals render at its provider, so these sit outside it (as Paper's docs advise)
  // to stay available to anything shown in a dialog.
  return (
    <QueryClientProvider client={queryClient}>
      <AccountDependenciesProvider value={deps.account}>
        <AdministrationDependenciesProvider value={deps.administration}>
        <BusinessDependenciesProvider value={deps.business}>
          <RecordsDependenciesProvider value={deps.records}>
            <OperationsDependenciesProvider value={deps.operations}>
              <AnalyticsDependenciesProvider value={deps.analytics}>
                <LearningDependenciesProvider value={deps.learning}>
                  <AssistantDependenciesProvider value={deps.assistant}>
                    <NotificationsDependenciesProvider value={deps.notifications}>
                      <PlanDependenciesProvider value={deps.plan}>
                        <SessionProvider>
                          <EntryChoiceProvider>
                            <ActiveBusinessProvider>
                              <ThemedApp>{children}</ThemedApp>
                            </ActiveBusinessProvider>
                          </EntryChoiceProvider>
                        </SessionProvider>
                      </PlanDependenciesProvider>
                    </NotificationsDependenciesProvider>
                  </AssistantDependenciesProvider>
                </LearningDependenciesProvider>
              </AnalyticsDependenciesProvider>
            </OperationsDependenciesProvider>
          </RecordsDependenciesProvider>
        </BusinessDependenciesProvider>
        </AdministrationDependenciesProvider>
      </AccountDependenciesProvider>
    </QueryClientProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [config] = useState(readSupabaseConfig);
  const fontsReady = useBrandFonts();

  useEffect(() => {
    if (fontsReady) SplashScreen.hide();
  }, [fontsReady]);

  if (!fontsReady) return null;
  if (!config) {
    return (
      <ThemedApp>
        <SetupRequiredScreen />
      </ThemedApp>
    );
  }
  return <ConfiguredProviders config={config}>{children}</ConfiguredProviders>;
}
