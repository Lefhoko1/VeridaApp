import { z } from 'zod';

import { dateField, optionalNumberField, optionalText, requiredText } from '@/core/forms/fields';

import type { ActivityField, ActivityStatus, ActivityType, DetailValue } from './models';

const emptyToNull = (value: string) => (value === '' ? null : value);

export const ACTIVITY_START_STATUSES = ['recorded', 'planned', 'in_progress', 'requires_review'] as const;

export const activityFormSchema = z
  .object({
    activityTypeId: z.string().min(1, 'Choose what you are recording.'),
    occurredOn: dateField,
    status: z.enum(ACTIVITY_START_STATUSES),
    quantity: optionalNumberField('Quantity'),
    unit: z.string().trim().max(30, 'Unit must be at most 30 characters.'),
    flockId: z.string(),
    notes: optionalText(),
    responsibleUserId: z.string(),
    saleId: z.string(),
    expenseId: z.string(),
    productId: z.string(),
  })
  .transform((form) => ({
    ...form,
    unit: form.quantity === null ? null : form.unit || null,
    flockId: emptyToNull(form.flockId),
    responsibleUserId: emptyToNull(form.responsibleUserId),
    saleId: emptyToNull(form.saleId),
    expenseId: emptyToNull(form.expenseId),
    productId: emptyToNull(form.productId),
  }));

// FR-I07: the rules an administrator configured. The database enforces them too; checking here
// gives a clear message on the form, and lets an import report every bad line before it commits.
// A quantity is needed only once the activity is completed.
export function activityRuleProblem(
  type: ActivityType,
  input: { quantity: number | null; unit: string | null; notes: string | null; status?: ActivityStatus },
): string | null {
  const completed = (input.status ?? 'recorded') === 'recorded';
  if (input.quantity === null) {
    if (type.quantityMode === 'required' && completed) return `${type.name} needs a quantity.`;
  } else if (type.quantityMode !== 'none') {
    if (input.quantity < 0 && !type.allowsNegative) return `${type.name} cannot be negative.`;
    if (type.minQuantity !== null && input.quantity < type.minQuantity) return `${type.name} cannot be less than ${type.minQuantity}.`;
    if (type.maxQuantity !== null && input.quantity > type.maxQuantity) return `${type.name} cannot be more than ${type.maxQuantity}.`;
    if (type.wholeNumbersOnly && !Number.isInteger(input.quantity)) return `${type.name} must be a whole number.`;
    const unit = (input.unit ?? type.defaultUnit).trim().toLowerCase();
    if (type.allowedUnits.length > 0 && !type.allowedUnits.some((allowed) => allowed.toLowerCase() === unit)) {
      return `${type.name} must use one of these units: ${type.allowedUnits.join(', ')}.`;
    }
  }
  if (type.notesRequired && completed && !input.notes?.trim()) return `${type.name} needs a note.`;
  return null;
}

// What the form holds for each field before it is checked: text, a choice, or several choices.
export type DetailDraft = Record<string, string | string[]>;

const YES = 'yes';
const NO = 'no';

export function draftFromDetails(fields: ActivityField[], details: Record<string, DetailValue>): DetailDraft {
  const draft: DetailDraft = {};
  for (const field of fields) {
    const value = details[field.code];
    if (value === undefined) draft[field.code] = field.dataType === 'multi_select' ? [] : '';
    else if (typeof value === 'boolean') draft[field.code] = value ? YES : NO;
    else if (Array.isArray(value)) draft[field.code] = value;
    else draft[field.code] = String(value);
  }
  return draft;
}

// Activity Catalogue section 4: checks each answer against its field and converts it to the
// stored type. Required answers are needed only for a completed activity, as in the database.
export function parseDetails(
  fields: ActivityField[],
  draft: DetailDraft,
  completed: boolean,
): { details: Record<string, DetailValue>; errors: Record<string, string> } {
  const details: Record<string, DetailValue> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = draft[field.code];
    const isEmpty = raw === undefined || (Array.isArray(raw) ? raw.length === 0 : raw.trim() === '');
    if (isEmpty) {
      if (field.isRequired && completed) errors[field.code] = `${field.label} is required.`;
      continue;
    }
    const text = Array.isArray(raw) ? '' : raw.trim();
    switch (field.dataType) {
      case 'integer':
      case 'decimal': {
        const number = Number(text);
        if (!/^-?\d+(\.\d+)?$/.test(text) || !Number.isFinite(number)) errors[field.code] = `${field.label} must be a number.`;
        else if (field.dataType === 'integer' && !Number.isInteger(number)) errors[field.code] = `${field.label} must be a whole number.`;
        else if (field.minValue !== null && number < field.minValue) errors[field.code] = `${field.label} cannot be less than ${field.minValue}.`;
        else if (field.maxValue !== null && number > field.maxValue) errors[field.code] = `${field.label} cannot be more than ${field.maxValue}.`;
        else details[field.code] = number;
        break;
      }
      case 'boolean':
        if (text !== YES && text !== NO) errors[field.code] = `${field.label} must be yes or no.`;
        else details[field.code] = text === YES;
        break;
      case 'date':
        if (!dateField.safeParse(text).success) errors[field.code] = `${field.label} must be a date, such as 2026-10-05.`;
        else details[field.code] = text;
        break;
      case 'time':
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) errors[field.code] = `${field.label} must be a time, such as 14:30.`;
        else details[field.code] = text;
        break;
      case 'select':
        if (!field.options.includes(text)) errors[field.code] = `Choose ${field.label.toLowerCase()} from the list.`;
        else details[field.code] = text;
        break;
      case 'multi_select': {
        const chosen = Array.isArray(raw) ? raw : [];
        if (chosen.some((value) => !field.options.includes(value))) errors[field.code] = `Choose ${field.label.toLowerCase()} from the list.`;
        else details[field.code] = chosen;
        break;
      }
      default:
        if (text.length > 500) errors[field.code] = `${field.label} must be at most 500 characters.`;
        else details[field.code] = text;
    }
  }
  return { details, errors };
}

// How a stored answer reads on a profile.
export function formatDetail(field: ActivityField, value: DetailValue | undefined): string | null {
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return field.unit ? `${value} ${field.unit}` : String(value);
}

export const flockFormSchema = z.object({
  name: requiredText('Flock name'),
  breed: optionalText(60),
  acquiredOn: z.string().trim().pipe(z.union([z.literal('').transform(() => null), dateField])),
  initialCount: optionalNumberField('Starting count', { min: 0 }),
});
