import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Session } from '../../domain/models';
import { useAccountDependencies } from '../di';

type SessionState = (
  | { status: 'loading'; session: null }
  | { status: 'signed-out'; session: null }
  // A session is stored but could not be refreshed, usually because the network failed. Showing
  // sign-in here would be wrong: the stored account comes back once a later refresh succeeds.
  | { status: 'unavailable'; session: null }
  | { status: 'signed-in'; session: Session }
) & { retry: () => void };

const UNAVAILABLE = 'unavailable';

const SessionContext = createContext<SessionState | null>(null);

// The single source of truth for who is signed in. The root navigator guards routes with it.
export function SessionProvider({ children }: { children: ReactNode }) {
  const { auth } = useAccountDependencies();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined | typeof UNAVAILABLE>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    auth
      .getSession()
      .then((current) => {
        if (!cancelled) setSession((existing) => (existing === undefined ? current : existing));
      })
      .catch(() => {
        if (!cancelled) setSession((existing) => (existing === undefined ? UNAVAILABLE : existing));
      });
    const unsubscribe = auth.onSessionChange(setSession);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [auth, attempt]);

  const retry = useCallback(() => {
    setSession(undefined);
    setAttempt((count) => count + 1);
  }, []);

  // Cached data belongs to the signed-in user, and the next person on this device must not see it.
  useEffect(() => {
    if (session === null) queryClient.clear();
  }, [session, queryClient]);

  const value = useMemo<SessionState>(() => {
    if (session === undefined) return { status: 'loading', session: null, retry };
    if (session === UNAVAILABLE) return { status: 'unavailable', session: null, retry };
    return session ? { status: 'signed-in', session, retry } : { status: 'signed-out', session: null, retry };
  }, [session, retry]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider.');
  return value;
}

// For screens that only render when signed in.
export function useCurrentUser(): Session {
  const { session } = useSession();
  if (!session) throw new Error('useCurrentUser requires a signed-in user.');
  return session;
}
