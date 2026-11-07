import { deviceStore, type KeyValueStore } from '@/core/storage/keyValueStore';

import { parseEntryChoice, type EntryChoice } from '../domain/entryChoice';
import type { EntryChoiceRepository } from '../domain/repositories';

const KEY = 'verida.entry-choice';

export class DeviceEntryChoiceRepository implements EntryChoiceRepository {
  constructor(private readonly store: KeyValueStore = deviceStore) {}

  async load(): Promise<EntryChoice | null> {
    return parseEntryChoice(await this.store.getItem(KEY));
  }

  async save(choice: EntryChoice): Promise<void> {
    await this.store.setItem(KEY, choice);
  }
}
