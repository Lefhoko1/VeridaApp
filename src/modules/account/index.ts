import type { SupabaseClient } from '@/core/supabase/client';

import { DeviceEntryChoiceRepository } from './data/DeviceEntryChoiceRepository';
import { SupabaseAuthRepository } from './data/SupabaseAuthRepository';
import { SupabaseProfileRepository } from './data/SupabaseProfileRepository';
import type { AccountDependencies } from './presentation/di';

export function createAccountDependencies(client: SupabaseClient): AccountDependencies {
  return {
    auth: new SupabaseAuthRepository(client),
    profiles: new SupabaseProfileRepository(client),
    entryChoice: new DeviceEntryChoiceRepository(),
  };
}

export type { EntryChoice } from './domain/entryChoice';
export type { Session } from './domain/models';
export { AccountDependenciesProvider } from './presentation/di';
export { useAccountAccess } from './presentation/viewmodels/useAccountAccess';
export { EntryChoiceProvider, useEntryChoice } from './presentation/viewmodels/useEntryChoice';
export { SessionProvider, useCurrentUser, useSession } from './presentation/viewmodels/useSession';
export { ForgotPasswordScreen, SignInScreen, SignUpScreen, VerifyEmailScreen } from './presentation/views/authScreens';
export { LandingScreen } from './presentation/views/landingScreen';
export { AccountBlockedScreen, AccountSecurityScreen, ProfileScreen } from './presentation/views/profileScreens';
