import { activityTypeSchema, grantRoleSchema, retentionSchema } from './validation';

const activity = { code: 'catch', name: 'Catch', description: '', defaultUnit: 'kg', usesFlock: 'no', allowsNegative: 'no', minQuantity: '', maxQuantity: '', wholeNumbersOnly: 'no', notesRequired: 'no', allowedUnits: '' };

describe('activityTypeSchema (FR-I07)', () => {
  it('turns the form into rules', () => {
    expect(activityTypeSchema.parse({ ...activity, minQuantity: '1', maxQuantity: '5', wholeNumbersOnly: 'yes', notesRequired: 'yes', allowedUnits: 'kg, tonnes' })).toMatchObject({
      minQuantity: 1,
      maxQuantity: 5,
      wholeNumbersOnly: true,
      notesRequired: true,
      allowedUnits: ['kg', 'tonnes'],
    });
  });

  it('refuses a minimum above the maximum', () => {
    expect(activityTypeSchema.safeParse({ ...activity, minQuantity: '9', maxQuantity: '5' }).success).toBe(false);
  });

  it('refuses a default unit outside the allowed units', () => {
    expect(activityTypeSchema.safeParse({ ...activity, allowedUnits: 'tonnes' }).success).toBe(false);
  });
});

describe('retentionSchema', () => {
  it.each([['0', 0], ['30', 30], ['3650', 3650]])('accepts %s days', (days, expected) => {
    expect(retentionSchema.parse({ days })).toEqual({ days: expected });
  });

  it.each(['', '-1', '1.5', '3651', 'soon'])('refuses %j', (days) => {
    expect(retentionSchema.safeParse({ days }).success).toBe(false);
  });
});

describe('grantRoleSchema', () => {
  it('knows the support role', () => {
    expect(grantRoleSchema.parse({ email: 'A@B.COM', role: 'support' })).toEqual({ email: 'a@b.com', role: 'support' });
  });
});
