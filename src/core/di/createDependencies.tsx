import { createContext, useContext, type ReactNode } from 'react';

// Each module declares its own dependency context. ViewModels then depend only on their
// module's interfaces, and tests can supply fakes without any other module present.
export function createDependencies<T>(moduleName: string) {
  const Context = createContext<T | null>(null);

  function Provider({ value, children }: { value: T; children: ReactNode }) {
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useDependencies(): T {
    const value = useContext(Context);
    if (value === null) {
      throw new Error(`${moduleName} dependencies are missing. Is its provider in AppProviders?`);
    }
    return value;
  }

  return { Provider, useDependencies };
}
