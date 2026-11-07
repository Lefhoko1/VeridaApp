import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// SecureStore warns above 2048 bytes and session tokens are larger, so values are split.
const CHUNK_SIZE = 1800;
const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

export function splitIntoChunks(value: string, size: number = CHUNK_SIZE): string[] {
  if (value.length === 0) return [''];
  const chunks: string[] = [];
  for (let start = 0; start < value.length; start += size) {
    chunks.push(value.slice(start, start + size));
  }
  return chunks;
}

type SecureBackend = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;

export function createChunkedSecureStore(backend: SecureBackend = SecureStore): KeyValueStore {
  async function removeItem(key: string): Promise<void> {
    const stored = await backend.getItemAsync(countKey(key));
    const count = stored ? Number(stored) : 0;
    await Promise.all(Array.from({ length: count }, (_, i) => backend.deleteItemAsync(chunkKey(key, i))));
    await backend.deleteItemAsync(countKey(key));
  }

  return {
    async getItem(key) {
      const stored = await backend.getItemAsync(countKey(key));
      if (!stored) return null;
      const parts = await Promise.all(
        Array.from({ length: Number(stored) }, (_, i) => backend.getItemAsync(chunkKey(key, i))),
      );
      // A missing chunk means a torn write. Treat it as absent rather than return a corrupt token.
      return parts.some((part) => part === null) ? null : parts.join('');
    },
    async setItem(key, value) {
      await removeItem(key);
      const chunks = splitIntoChunks(value);
      await Promise.all(chunks.map((chunk, i) => backend.setItemAsync(chunkKey(key, i), chunk)));
      await backend.setItemAsync(countKey(key), String(chunks.length));
    },
    removeItem,
  };
}

const browserStore: KeyValueStore = {
  getItem: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key, value) => globalThis.localStorage?.setItem(key, value),
  removeItem: async (key) => globalThis.localStorage?.removeItem(key),
};

export const deviceStore: KeyValueStore = Platform.OS === 'web' ? browserStore : createChunkedSecureStore();
