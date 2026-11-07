import { z } from 'zod';

import { dateField, numberField, optionalNumberField, optionalText, requiredText } from '@/core/forms/fields';

import type { ActivityType } from './models';

export const activityFormSchema = z
  .object({
    activityTypeId: z.string().min(1, 'Choose what you are recording.'),
    occurredOn: dateField,
    quantity: numberField('Quantity'),
    unit: requiredText('Unit', 30),
    flockId: z.string(),
    notes: optionalText(),
  })
  .transform((form) => ({ ...form, flockId: form.flockId === '' ? null : form.flockId }));

// FR-I07: the rules an administrator configured. The database enforces them too; checking here
// gives a clear message on the form, and lets an import report every bad line before it commits.
export function activityRuleProblem(type: ActivityType, input: { quantity: number; unit: string; notes: string | null }): string | null {
  if (input.quantity < 0 && !type.allowsNegative) return `${type.name} cannot be negative.`;
  if (type.minQuantity !== null && input.quantity < type.minQuantity) return `${type.name} cannot be less than ${type.minQuantity}.`;
  if (type.maxQuantity !== null && input.quantity > type.maxQuantity) return `${type.name} cannot be more than ${type.maxQuantity}.`;
  if (type.wholeNumbersOnly && !Number.isInteger(input.quantity)) return `${type.name} must be a whole number.`;
  if (type.notesRequired && !input.notes?.trim()) return `${type.name} needs a note.`;
  if (type.allowedUnits.length > 0 && !type.allowedUnits.some((unit) => unit.toLowerCase() === input.unit.trim().toLowerCase())) {
    return `${type.name} must use one of these units: ${type.allowedUnits.join(', ')}.`;
  }
  return null;
}

export const flockFormSchema = z.object({
  name: requiredText('Flock name'),
  breed: optionalText(60),
  acquiredOn: z.string().trim().pipe(z.union([z.literal('').transform(() => null), dateField])),
  initialCount: optionalNumberField('Starting count', { min: 0 }),
});
