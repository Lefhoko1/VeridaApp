import { z } from 'zod';

// Shared field rules for the string values that forms collect.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const dateField = z
  .string()
  .trim()
  .refine((value) => ISO_DATE.test(value) && isRealDate(value), 'Enter a date as YYYY-MM-DD.');

export const requiredText = (label: string, max = 120) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .transform((value) => (value.length > 0 ? value : null));

const isNumber = (value: string) => value.trim() !== '' && Number.isFinite(Number(value));

export const numberField = (label: string, { min, exclusiveMin = false }: { min?: number; exclusiveMin?: boolean } = {}) =>
  z
    .string()
    .refine(isNumber, `${label} must be a number.`)
    .transform(Number)
    .refine(
      (value) => min === undefined || (exclusiveMin ? value > min : value >= min),
      exclusiveMin ? `${label} must be more than ${min}.` : `${label} cannot be less than ${min}.`,
    );

export const optionalNumberField = (label: string, { min }: { min?: number } = {}) =>
  z
    .string()
    .refine((value) => value.trim() === '' || isNumber(value), `${label} must be a number.`)
    .transform((value) => (value.trim() === '' ? null : Number(value)))
    .refine((value) => value === null || min === undefined || value >= min, `${label} cannot be less than ${min}.`);
