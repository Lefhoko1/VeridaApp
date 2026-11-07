import { createDependencies } from '@/core/di/createDependencies';

import type { AuthRepository, EntryChoiceRepository, ProfileRepository } from '../domain/repositories';

export type AccountDependencies = {
  auth: AuthRepository;
  profiles: ProfileRepository;
  entryChoice: EntryChoiceRepository;
};

export const { Provider: AccountDependenciesProvider, useDependencies: useAccountDependencies } =
  createDependencies<AccountDependencies>('Account');
