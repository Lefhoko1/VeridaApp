import { joinChoices, splitChoices } from './forms/choices';
import { COUNTRIES, COUNTRY_OPTIONS, CURRENCIES, CURRENCY_OPTIONS, currencyForCountry } from './geo/countries';

describe('several answers in one text column', () => {
  it('round-trips a list', () => {
    const text = joinChoices(['Grow my business', 'Control expenses']);
    expect(text).toBe('Grow my business; Control expenses');
    expect(splitChoices(text)).toEqual(['Grow my business', 'Control expenses']);
  });

  it('keeps an older single answer working', () => {
    expect(splitChoices('Grow my business')).toEqual(['Grow my business']);
  });

  it('treats nothing as an empty list', () => {
    expect(splitChoices(null)).toEqual([]);
    expect(splitChoices('')).toEqual([]);
    expect(joinChoices([])).toBe('');
  });

  it('stops a typed answer from splitting into two', () => {
    expect(splitChoices(joinChoices(['Export; import', ' ']))).toEqual(['Export, import']);
  });
});

describe('countries and currencies', () => {
  it('suggests a currency for a country, ignoring case', () => {
    expect(currencyForCountry('Botswana')).toBe('BWP');
    expect(currencyForCountry('south africa')).toBe('ZAR');
    expect(currencyForCountry(' United States ')).toBe('USD');
  });

  it('suggests nothing for a name it does not know', () => {
    expect(currencyForCountry('Atlantis')).toBeNull();
  });

  it('has a named currency for every country', () => {
    const named = new Set(CURRENCIES.map((currency) => currency.code));
    expect(COUNTRIES.filter((country) => !named.has(country.currency))).toEqual([]);
  });

  it('lists each option once, so that it can be used as a key', () => {
    expect(new Set(COUNTRY_OPTIONS.map((option) => option.value)).size).toBe(COUNTRY_OPTIONS.length);
    expect(new Set(CURRENCY_OPTIONS.map((option) => option.value)).size).toBe(CURRENCY_OPTIONS.length);
  });

  it('only uses codes the database accepts', () => {
    expect(CURRENCIES.filter((currency) => !/^[A-Z]{3}$/.test(currency.code))).toEqual([]);
  });
});
