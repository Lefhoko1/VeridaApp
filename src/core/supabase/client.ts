import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { SupabaseConfig } from '../config/env';
import { deviceStore } from '../storage/keyValueStore';

export type { SupabaseClient };

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      storage: deviceStore,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  // On native, the refresh loop should only run while the app is in the foreground.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void client.auth.startAutoRefresh();
      } else {
        void client.auth.stopAutoRefresh();
      }
    });
  }

  return client;
}
