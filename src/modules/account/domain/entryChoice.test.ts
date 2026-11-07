import { areaOf, choiceFor, parseEntryChoice } from './entryChoice';

describe('entry choice', () => {
  it('reads back a saved choice', () => {
    expect(parseEntryChoice('verida_team')).toBe('verida_team');
    expect(parseEntryChoice('join_business')).toBe('join_business');
  });

  it('treats anything else on the device as no choice', () => {
    expect(parseEntryChoice(null)).toBeNull();
    expect(parseEntryChoice('administrator')).toBeNull();
  });

  it('groups running and joining a business into the business area', () => {
    expect(areaOf('own_business')).toBe('business');
    expect(areaOf('join_business')).toBe('business');
    expect(areaOf(null)).toBe('business');
    expect(areaOf('verida_team')).toBe('team');
  });

  it('maps each sign-in area back to a choice', () => {
    expect(choiceFor('business')).toBe('own_business');
    expect(choiceFor('team')).toBe('verida_team');
  });
});
