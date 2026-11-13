import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppError } from '@/core/errors/AppError';

import { EmailNotVerifiedError } from '../../domain/errors';
import type { AuthRepository, EntryChoiceRepository } from '../../domain/repositories';
import { AccountDependenciesProvider } from '../di';
import { useSignInViewModel } from './authViewModels';
import { EntryChoiceProvider } from './useEntryChoice';

jest.mock('@/design-system', () => ({ useFeedback: () => ({ success: jest.fn(), error: jest.fn() }) }));

const EMAIL = 'new@example.com';

function setup(signIn: () => Promise<void>) {
  const auth = {
    signIn: jest.fn(signIn),
    resendVerification: jest.fn(async () => undefined),
  } as unknown as AuthRepository;
  const entryChoice: EntryChoiceRepository = { load: async () => null, save: async () => undefined };
  // An infinite gcTime sets no cleanup timer, which would otherwise keep Jest running for minutes.
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AccountDependenciesProvider value={{ auth, profiles: {} as never, entryChoice }}>
        <EntryChoiceProvider>{children}</EntryChoiceProvider>
      </AccountDependenciesProvider>
    </QueryClientProvider>
  );
  return { auth, wrapper };
}

async function submit(result: { current: ReturnType<typeof useSignInViewModel> }) {
  await act(async () => {
    result.current.form.setValue('email', EMAIL);
    result.current.form.setValue('password', 'Password1');
  });
  await act(async () => result.current.submit());
}

describe('sign-in', () => {
  // FR-A05 to FR-A07: an unverified account is sent to enter its code, not left at an error.
  it('takes an unverified account to the code screen with a fresh code', async () => {
    const { auth, wrapper } = setup(async () => {
      throw new EmailNotVerifiedError();
    });
    const onUnverified = jest.fn();
    const { result } = await renderHook(() => useSignInViewModel(onUnverified), { wrapper });

    await submit(result);

    await waitFor(() => expect(onUnverified).toHaveBeenCalledWith(EMAIL));
    expect(auth.resendVerification).toHaveBeenCalledWith(EMAIL);
    expect(result.current.error).toBeNull();
  });

  it('still reaches the code screen when a fresh code cannot be sent', async () => {
    const { auth, wrapper } = setup(async () => {
      throw new EmailNotVerifiedError();
    });
    jest.mocked(auth.resendVerification).mockRejectedValueOnce(new AppError('conflict', 'Please wait'));
    const onUnverified = jest.fn();
    const { result } = await renderHook(() => useSignInViewModel(onUnverified), { wrapper });

    await submit(result);

    await waitFor(() => expect(onUnverified).toHaveBeenCalledWith(EMAIL));
  });

  it('shows wrong credentials as an error and stays on sign-in', async () => {
    const { auth, wrapper } = setup(async () => {
      throw new AppError('unauthenticated', 'That email or password is not correct.');
    });
    const onUnverified = jest.fn();
    const { result } = await renderHook(() => useSignInViewModel(onUnverified), { wrapper });

    await submit(result);

    await waitFor(() => expect(result.current.error).toBe('That email or password is not correct.'));
    expect(onUnverified).not.toHaveBeenCalled();
    expect(auth.resendVerification).not.toHaveBeenCalled();
  });
});
