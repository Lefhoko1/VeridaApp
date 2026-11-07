export type SelectOption = { value: string; label: string };

export function matchesSearch(option: SelectOption, search: string): boolean {
  return option.label.toLowerCase().includes(search.trim().toLowerCase());
}

// Choosing "all" selects every listed option, and choosing it again clears them.
export function toggleAll(selected: readonly string[], options: readonly SelectOption[]): string[] {
  const everything = options.every((option) => selected.includes(option.value));
  return everything ? [] : options.map((option) => option.value);
}

export function toggleOption(selected: readonly string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
}
