// How someone says they are using Verida, chosen at sign-in and registration. It decides which
// area opens first and nothing else: roles are held in the database, and a choice never grants one.
export const ENTRY_CHOICES = ['own_business', 'join_business', 'verida_team'] as const;

export type EntryChoice = (typeof ENTRY_CHOICES)[number];

export type EntryArea = 'business' | 'team';

export const areaOf = (choice: EntryChoice | null): EntryArea => (choice === 'verida_team' ? 'team' : 'business');

export const choiceFor = (area: EntryArea): EntryChoice => (area === 'team' ? 'verida_team' : 'own_business');

// Stored on the device, so anything unexpected is treated as no choice at all.
export function parseEntryChoice(value: string | null): EntryChoice | null {
  return ENTRY_CHOICES.find((choice) => choice === value) ?? null;
}
