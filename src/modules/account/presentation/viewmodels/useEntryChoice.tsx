import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { EntryChoice } from '../../domain/entryChoice';
import { useAccountDependencies } from '../di';

type EntryChoiceState = {
  // False until the saved choice has been read, so the app doesn't open the wrong area first.
  ready: boolean;
  choice: EntryChoice | null;
  setChoice: (choice: EntryChoice) => void;
};

const EntryChoiceContext = createContext<EntryChoiceState | null>(null);

export function EntryChoiceProvider({ children }: { children: ReactNode }) {
  const { entryChoice } = useAccountDependencies();
  const [state, setState] = useState<{ ready: boolean; choice: EntryChoice | null }>({ ready: false, choice: null });

  useEffect(() => {
    let cancelled = false;
    entryChoice
      .load()
      .catch(() => null)
      .then((choice) => {
        if (!cancelled) setState((current) => (current.ready ? current : { ready: true, choice }));
      });
    return () => {
      cancelled = true;
    };
  }, [entryChoice]);

  const setChoice = useCallback(
    (choice: EntryChoice) => {
      setState({ ready: true, choice });
      // Only a convenience for next time, so failing to save it must not interrupt anyone.
      void entryChoice.save(choice).catch(() => undefined);
    },
    [entryChoice],
  );

  const value = useMemo(() => ({ ...state, setChoice }), [state, setChoice]);
  return <EntryChoiceContext.Provider value={value}>{children}</EntryChoiceContext.Provider>;
}

export function useEntryChoice(): EntryChoiceState {
  const value = useContext(EntryChoiceContext);
  if (!value) throw new Error('useEntryChoice must be used inside EntryChoiceProvider.');
  return value;
}
