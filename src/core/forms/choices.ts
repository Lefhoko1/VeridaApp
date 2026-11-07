// Several answers to one question, kept in a single text column. It reads naturally wherever the
// text is shown as it stands, including in AI prompts, and older single answers still work.
const SEPARATOR = '; ';

export function joinChoices(choices: readonly string[]): string {
  return choices
    .map((choice) => choice.replaceAll(';', ',').trim())
    .filter(Boolean)
    .join(SEPARATOR);
}

export function splitChoices(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(';')
    .map((choice) => choice.trim())
    .filter(Boolean);
}
