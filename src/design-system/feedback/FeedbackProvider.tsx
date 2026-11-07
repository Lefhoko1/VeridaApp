import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Snackbar } from 'react-native-paper';

import { palette, supporting } from '../theme/palette';

type Feedback = {
  success(message: string): void;
  error(message: string): void;
};

const FeedbackContext = createContext<Feedback | null>(null);

// Section 7: every operation gives a clear success or failure response.
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ message: string; isError: boolean } | null>(null);

  const success = useCallback((message: string) => setState({ message, isError: false }), []);
  const error = useCallback((message: string) => setState({ message, isError: true }), []);
  const value = useMemo(() => ({ success, error }), [success, error]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Snackbar
        visible={state !== null}
        onDismiss={() => setState(null)}
        duration={state?.isError ? 5000 : 2500}
        style={{ backgroundColor: state?.isError ? supporting.error : palette.deepTeal }}
      >
        {state?.message ?? ''}
      </Snackbar>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): Feedback {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback must be used inside FeedbackProvider.');
  return value;
}
