import type { ActivityField, ActivityType } from './models';
import { activityRuleProblem, draftFromDetails, formatDetail, parseDetails } from './validation';

const type: ActivityType = {
  id: 't',
  code: 'eggs',
  name: 'Eggs collected',
  description: '',
  groupCode: 'production_operations',
  groupName: 'Production and operations',
  defaultUnit: 'eggs',
  quantityMode: 'required',
  usesFlock: true,
  allowsNegative: false,
  minQuantity: null,
  maxQuantity: null,
  wholeNumbersOnly: false,
  notesRequired: false,
  allowedUnits: [],
  isEnabled: true,
  enabledByDefault: true,
  fields: [],
};
const input = { quantity: 5 as number | null, unit: 'eggs' as string | null, notes: null };

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

describe('quantities and the lifecycle (Activity Catalogue)', () => {
  it('needs a quantity only once the activity is completed', () => {
    expect(activityRuleProblem(type, { ...input, quantity: null })).toContain('needs a quantity');
    expect(activityRuleProblem(type, { ...input, quantity: null, status: 'planned' })).toBeNull();
    expect(activityRuleProblem({ ...type, quantityMode: 'optional' }, { ...input, quantity: null })).toBeNull();
  });

  it('asks for a required note only on completion', () => {
    expect(activityRuleProblem({ ...type, notesRequired: true }, { ...input, notes: null, status: 'in_progress' })).toBeNull();
  });
});

const field = (overrides: Partial<ActivityField>): ActivityField => ({
  code: 'f',
  label: 'Field',
  help: '',
  dataType: 'text',
  isRequired: false,
  unit: null,
  options: [],
  minValue: null,
  maxValue: null,
  ...overrides,
});

describe('form answers (Activity Catalogue section 4)', () => {
  const fields = [
    field({ code: 'cause', label: 'Cause', dataType: 'select', isRequired: true, options: ['Heat stress', 'Disease'] }),
    field({ code: 'birds', label: 'Birds', dataType: 'integer', minValue: 0, unit: 'birds' }),
    field({ code: 'ok', label: 'Water ok', dataType: 'boolean' }),
    field({ code: 'grades', label: 'Grades', dataType: 'multi_select', options: ['Small', 'Large'] }),
    field({ code: 'until', label: 'Until', dataType: 'date' }),
  ];

  it('converts answers to their stored types', () => {
    const result = parseDetails(fields, { cause: 'Disease', birds: '12', ok: 'yes', grades: ['Large'], until: '2026-10-05' }, true);
    expect(result.errors).toEqual({});
    expect(result.details).toEqual({ cause: 'Disease', birds: 12, ok: true, grades: ['Large'], until: '2026-10-05' });
  });

  it('leaves out empty answers, and needs required ones only on completion', () => {
    expect(parseDetails(fields, { birds: '' }, true).errors).toEqual({ cause: 'Cause is required.' });
    expect(parseDetails(fields, { birds: '' }, false)).toEqual({ details: {}, errors: {} });
  });

  it('explains each kind of wrong answer', () => {
    const { errors } = parseDetails(fields, { cause: 'Aliens', birds: '1.5', ok: 'maybe', grades: ['Huge'], until: '5 Oct' }, true);
    expect(Object.keys(errors).sort()).toEqual(['birds', 'cause', 'grades', 'ok', 'until']);
    expect(parseDetails(fields, { cause: 'Disease', birds: '-1' }, true).errors.birds).toContain('cannot be less than 0');
  });

  it('round-trips stored answers back into the form and onto a profile', () => {
    expect(draftFromDetails(fields, { cause: 'Disease', birds: 3, ok: false })).toEqual({ cause: 'Disease', birds: '3', ok: 'no', grades: [], until: '' });
    expect(formatDetail(fields[1]!, 3)).toBe('3 birds');
    expect(formatDetail(fields[2]!, true)).toBe('Yes');
    expect(formatDetail(fields[3]!, ['Small', 'Large'])).toBe('Small, Large');
    expect(formatDetail(fields[0]!, undefined)).toBeNull();
  });
});
