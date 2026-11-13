import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { Session } from '../../domain/models';
import type { AuthRepository } from '../../domain/repositories';
import { AccountDependenciesProvider } from '../di';
import { SessionProvider, useCurrentUser, useSession } from './useSession';

const USER: Session = { userId: 'user-1', email: 'neo@example.com' };

function setup(initial: Session | null | Error) {
  let emit: (session: Session | null) => void = () => undefined;
  const unsubscribe = jest.fn();
  const auth = {
    getSession: jest.fn(async () => {
      if (initial instanceof Error) throw initial;
      return initial;
    }),
    onSessionChange: jest.fn((listener: (session: Session | null) => void) => {
      emit = listener;
      return unsubscribe;
    }),
  } as unknown as AuthRepository;
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AccountDependenciesProvider value={{ auth, profiles: {} as never, entryChoice: {} as never }}>
        <SessionProvider>{children}</SessionProvider>
      </AccountDependenciesProvider>
    </QueryClientProvider>
  );
  return { wrapper, queryClient, unsubscribe, auth, emit: (session: Session | null) => emit(session) };
}

describe('session', () => {
  it('resolves a stored session', async () => {
    const { wrapper } = setup(USER);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    expect(result.current.session).toEqual(USER);
  });

  it('reports signed out when nothing is stored', async () => {
    const { wrapper } = setup(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
  });

  // A stored account whose refresh failed comes back once the network does, so showing sign-in
  // would let someone register while the previous account is about to reappear.
  it('does not report signed out when the stored session cannot be checked', async () => {
    const { wrapper } = setup(new Error('network'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('checks the stored session again on retry', async () => {
    const { wrapper, auth } = setup(new Error('network'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    jest.mocked(auth.getSession).mockResolvedValueOnce(USER);
    await act(async () => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe('signed-in'));
  });

  it('follows the stored account when its refresh later succeeds', async () => {
    const { wrapper, emit } = setup(new Error('network'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));

    await act(async () => emit(USER));
    expect(result.current.status).toBe('signed-in');
  });

  it('follows sign-in and sign-out events', async () => {
    const { wrapper, emit } = setup(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signed-out'));

    await act(async () => emit(USER));
    expect(result.current.status).toBe('signed-in');

    await act(async () => emit(null));
    expect(result.current.status).toBe('signed-out');
  });

  it('clears cached data on sign-out, so the next user on this device cannot see it', async () => {
    const { wrapper, emit, queryClient } = setup(USER);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    queryClient.setQueryData(['business', 'biz-1', 'sales'], [{ id: 'secret' }]);

    await act(async () => emit(null));

    expect(queryClient.getQueryData(['business', 'biz-1', 'sales'])).toBeUndefined();
  });

  it('keeps cached data for a signed-in user', async () => {
    const { wrapper, queryClient } = setup(USER);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    queryClient.setQueryData(['x'], 1);
    expect(queryClient.getQueryData(['x'])).toBe(1);
  });

  it('stops listening when unmounted', async () => {
    const { wrapper, unsubscribe } = setup(USER);
    const { result, unmount } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    await unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('useCurrentUser refuses to run without a session', async () => {
    const { wrapper } = setup(null);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(renderHook(() => useCurrentUser(), { wrapper })).rejects.toThrow('requires a signed-in user');
    spy.mockRestore();
  });
});
