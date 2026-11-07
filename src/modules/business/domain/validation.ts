import { z } from 'zod';

import { optionalText, requiredText } from '@/core/forms/fields';

export const BUSINESS_STAGES = ['Already operating', 'Just starting', 'Growing / expanding'];
export const BUSINESS_SIZES = ['Small-scale', 'Medium-scale', 'Large-scale'];
export const BUSINESS_GOALS = [
  'Understand overall performance',
  'Improve profitability',
  'Control expenses',
  'Manage operations and inventory',
  'Grow my business',
  'Track sales and invoices',
  'Plan cash flow',
  'Prepare for finance or investors',
  'Learn business skills',
];
export const RECORD_KEEPING_OPTIONS = [
  'No formal records',
  'Mostly manual records',
  'Excel or spreadsheets',
  'Business software',
  'Mobile money or bank statements',
  'Receipts and invoices',
];

export const ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager — runs daily operations' },
  { value: 'staff', label: 'Staff — captures and edits records' },
  { value: 'viewer', label: 'Viewer — read only' },
];

// FR-B02, FR-B03.
export const businessDetailsSchema = z.object({
  name: requiredText('Business name'),
  industryCode: z.string().min(1, 'Choose at least one business type.'),
  additionalIndustries: z.string().transform((codes) => codes.split(',').filter(Boolean)),
  otherType: optionalText(80),
  stage: z.string().min(1, 'Choose a business stage.'),
  size: z.string().min(1, 'Choose a business size.'),
  country: z.string().trim().min(1, 'Choose a country.').max(60),
  location: optionalText(120),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Choose a currency.'),
  mainGoal: optionalText(600),
  recordKeeping: optionalText(400),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  role: z.enum(['manager', 'staff', 'viewer'], { error: 'Choose a role.' }),
});
