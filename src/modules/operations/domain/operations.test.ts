import type { ActivityType } from './models';
import { activityRuleProblem } from './validation';

const type: ActivityType = {
  id: 't',
  code: 'eggs',
  name: 'Eggs collected',
  description: '',
  defaultUnit: 'eggs',
  usesFlock: true,
  allowsNegative: false,
  minQuantity: null,
  maxQuantity: null,
  wholeNumbersOnly: false,
  notesRequired: false,
  allowedUnits: [],
};
const input = { quantity: 5, unit: 'eggs', notes: null };

describe('activityRuleProblem (FR-I07)', () => {
  it('accepts a record when no rule applies', () => {
    expect(activityRuleProblem(type, input)).toBeNull();
  });

  it.each([
    [{}, { quantity: -1 }, 'cannot be negative'],
    [{ minQuantity: 10 }, {}, 'cannot be less than 10'],
    [{ maxQuantity: 2 }, {}, 'cannot be more than 2'],
    [{ wholeNumbersOnly: true }, { quantity: 2.5 }, 'must be a whole number'],
    [{ notesRequired: true }, { notes: '  ' }, 'needs a note'],
    [{ allowedUnits: ['trays'] }, {}, 'one of these units: trays'],
  ])('applies the rule %j', (rule, record, message) => {
    expect(activityRuleProblem({ ...type, ...rule }, { ...input, ...record })).toContain(message);
  });

  it('ignores the case of a unit, as the database does', () => {
    expect(activityRuleProblem({ ...type, allowedUnits: ['Eggs'] }, input)).toBeNull();
  });

  it('allows negative values and the limits themselves', () => {
    expect(activityRuleProblem({ ...type, allowsNegative: true }, { ...input, quantity: -1 })).toBeNull();
    expect(activityRuleProblem({ ...type, minQuantity: 5, maxQuantity: 5 }, input)).toBeNull();
  });
});
