import { useEffect } from 'react';
import { AppState } from 'react-native';

// Runs the callback whenever the app comes back to the front, such as after the phone was locked.
// Kept in core so ViewModels can react to it without importing React Native.
export function useOnForeground(callback: () => void) {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') callback();
    });
    return () => subscription.remove();
  }, [callback]);
}
