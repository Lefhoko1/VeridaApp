import { matchesSearch, toggleAll, toggleOption } from './optionSelection';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

describe('picking options', () => {
  it('searches labels, ignoring case and spaces', () => {
    expect(matchesSearch(OPTIONS[0]!, ' alph ')).toBe(true);
    expect(matchesSearch(OPTIONS[0]!, 'beta')).toBe(false);
    expect(matchesSearch(OPTIONS[0]!, '')).toBe(true);
  });

  it('adds and removes one option', () => {
    expect(toggleOption(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleOption(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('selects everything, and clears when everything was already selected', () => {
    expect(toggleAll(['a'], OPTIONS)).toEqual(['a', 'b']);
    expect(toggleAll(['a', 'b'], OPTIONS)).toEqual([]);
  });
});
