import { z } from 'zod';

import { optionalNumberField, optionalText, requiredText } from '@/core/forms/fields';

const codeField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/, `${label} must use lowercase letters, numbers and underscores, starting with a letter.`);

const yesNo = z.enum(['yes', 'no']).transform((value) => value === 'yes');

export const YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export const ACCOUNT_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending_verification', label: 'Awaiting verification' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'deletion_requested', label: 'Deletion requested' },
  { value: 'erased', label: 'Erased' },
];

export const BUSINESS_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'deletion_requested', label: 'Deletion requested' },
];

export const ROLE_OPTIONS = [
  { value: 'learning_reviewer', label: 'Learning reviewer' },
  { value: 'support', label: 'Support' },
  { value: 'administrator', label: 'Administrator' },
];

export const MEMBER_ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager' },
  { value: 'staff', label: 'Staff' },
  { value: 'viewer', label: 'Viewer' },
];

// The roles whose permissions can be edited. Administrators always hold everything.
export const EDITABLE_STAFF_ROLES = [
  { code: 'learning_reviewer', name: 'Reviewer' },
  { code: 'support', name: 'Support' },
];

export const KPI_UNIT_OPTIONS = [
  { value: 'quantity', label: 'Quantity' },
  { value: 'count', label: 'Count' },
  { value: 'money', label: 'Money' },
  { value: 'percent', label: 'Percent' },
  { value: 'grams', label: 'Grams' },
];

// Only formulas a new KPI can use without code. The others are specific calculations.
export const KPI_FORMULA_OPTIONS = [
  { value: 'activity_total', label: 'Total of an activity' },
  { value: 'activity_latest', label: 'Latest value of an activity' },
];

export const adminUserSchema = z.object({
  fullName: requiredText('Name'),
  phone: optionalText(32),
});

export const businessConfigSchema = z.object({
  industryCode: z.string().min(1, 'Choose an industry.'),
  stage: requiredText('Stage', 60),
  size: requiredText('Size', 60),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, such as BWP.'),
});

// A universal sales or expense category, or a subcategory of one.
export const financeCategorySchema = z.object({
  code: codeField('Code'),
  kind: z.enum(['sale', 'expense']),
  parentCode: z.string().transform((value) => value || null),
  name: requiredText('Name', 80),
  description: optionalText(300).transform((value) => value ?? ''),
  sortOrder: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, 'Enter a whole number for the position.')
    .transform(Number),
});

// FR-I01: a main category of the business taxonomy.
export const businessCategorySchema = z.object({
  code: codeField('Code'),
  name: requiredText('Name', 80),
  description: optionalText(200).transform((value) => value ?? ''),
  icon: requiredText('Icon', 60),
  sortOrder: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, 'Enter a whole number for the position.')
    .transform(Number),
});

// FR-I01, FR-I03.
export const industrySchema = z.object({
  code: codeField('Code'),
  categoryCode: z.string().min(1, 'Choose a category.'),
  name: requiredText('Name'),
  shortName: requiredText('Short name', 40),
  description: requiredText('Description', 200),
  icon: requiredText('Icon', 60),
  chartTitle: requiredText('Chart title', 80),
});

export const categoryNameSchema = requiredText('Category name', 60);

// FR-I05, FR-I07.
export const activityTypeSchema = z
  .object({
    code: codeField('Code'),
    name: requiredText('Name'),
    description: optionalText(300).transform((value) => value ?? ''),
    defaultUnit: requiredText('Default unit', 30),
    usesFlock: yesNo,
    allowsNegative: yesNo,
    minQuantity: optionalNumberField('Minimum quantity'),
    maxQuantity: optionalNumberField('Maximum quantity', { min: 0 }),
    wholeNumbersOnly: yesNo,
    notesRequired: yesNo,
    allowedUnits: z.string().transform((value) => value.split(',').map((unit) => unit.trim()).filter(Boolean)),
  })
  .refine((rule) => rule.minQuantity === null || rule.maxQuantity === null || rule.minQuantity <= rule.maxQuantity, {
    path: ['minQuantity'],
    message: 'The minimum cannot be more than the maximum.',
  })
  .refine((rule) => rule.allowedUnits.length === 0 || rule.allowedUnits.some((unit) => unit.toLowerCase() === rule.defaultUnit.toLowerCase()), {
    path: ['allowedUnits'],
    message: 'The default unit must be one of the allowed units.',
  });

// FR-I06.
export const kpiSchema = z
  .object({
    code: codeField('Code'),
    name: requiredText('Name'),
    explanation: requiredText('Explanation', 400),
    formulaText: requiredText('How it is calculated', 200),
    requiredData: requiredText('What it needs', 200),
    unitKind: z.enum(['money', 'count', 'percent', 'grams', 'quantity']),
    formula: z.enum(['activity_total', 'activity_latest']),
    activityCode: codeField('Activity code'),
  });

// Matches the limit in platform.admin_set_retention.
export const retentionSchema = z.object({
  days: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Enter a whole number of days.')
    .transform(Number)
    .refine((days) => days <= 3650, 'The retention period cannot be more than 3650 days.'),
});

export const grantRoleSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  role: z.enum(['administrator', 'learning_reviewer', 'support']),
});
