import { entryDestination } from './entryDestination';

describe('where someone lands after signing in', () => {
  it('opens the staff tools only for someone who holds a role', () => {
    expect(entryDestination({ choice: 'verida_team', hasPlatformRole: true, businessStatus: 'none' })).toBe('/platform');
  });

  it('does not open the staff tools because someone chose the Verida team', () => {
    expect(entryDestination({ choice: 'verida_team', hasPlatformRole: false, businessStatus: 'none' })).toBe('/team-access');
    expect(entryDestination({ choice: 'verida_team', hasPlatformRole: false, businessStatus: 'ready' })).toBe('/team-access');
  });

  it('opens the workspace for a business choice, even for staff', () => {
    expect(entryDestination({ choice: 'own_business', hasPlatformRole: false, businessStatus: 'ready' })).toBe('/overview');
    expect(entryDestination({ choice: 'own_business', hasPlatformRole: true, businessStatus: 'ready' })).toBe('/overview');
  });

  it('sends someone with no business to setup, whether they run one or were invited', () => {
    expect(entryDestination({ choice: 'own_business', hasPlatformRole: false, businessStatus: 'none' })).toBe('/setup');
    expect(entryDestination({ choice: 'join_business', hasPlatformRole: false, businessStatus: 'none' })).toBe('/setup');
    expect(entryDestination({ choice: 'own_business', hasPlatformRole: true, businessStatus: 'none' })).toBe('/setup');
  });

  it('keeps sessions from before this choice existed working', () => {
    expect(entryDestination({ choice: null, hasPlatformRole: true, businessStatus: 'none' })).toBe('/platform');
    expect(entryDestination({ choice: null, hasPlatformRole: false, businessStatus: 'none' })).toBe('/setup');
    expect(entryDestination({ choice: null, hasPlatformRole: true, businessStatus: 'ready' })).toBe('/overview');
  });
});
