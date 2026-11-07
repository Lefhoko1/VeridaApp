import { z } from 'zod';

import { dateField, numberField, optionalNumberField, optionalText, requiredText } from '@/core/forms/fields';

// FR-C08, FR-C20.
export const saleFormSchema = z
  .object({
    occurredOn: dateField,
    productId: z.string(),
    itemName: requiredText('Item or service'),
    category: requiredText('Category'),
    quantity: numberField('Quantity', { min: 0, exclusiveMin: true }),
    unit: optionalText(30),
    unitPrice: numberField('Unit price', { min: 0 }),
    notes: optionalText(),
  })
  .transform((form) => ({ ...form, productId: form.productId === '' ? null : form.productId }));

// FR-C28, FR-C30.
export const expenseFormSchema = z.object({
  occurredOn: dateField,
  category: requiredText('Category'),
  description: requiredText('Description', 200),
  amount: numberField('Amount', { min: 0 }),
  quantity: optionalNumberField('Quantity', { min: 0 }),
  unit: optionalText(30),
  certainty: z.enum(['recorded', 'estimated', 'incomplete']),
  notes: optionalText(),
});

// FR-C36.
export const productFormSchema = z.object({
  kind: z.enum(['product', 'service']),
  name: requiredText('Name'),
  category: optionalText(60),
  description: optionalText(),
  unit: requiredText('Unit', 30),
  sellingPrice: numberField('Selling price', { min: 0 }),
});


export const CERTAINTY_OPTIONS = [
  { value: 'recorded', label: 'Recorded — I have the exact figure' },
  { value: 'estimated', label: 'Estimated — my best guess' },
  { value: 'incomplete', label: 'Incomplete — part of the cost is missing' },
];

export const PRODUCT_KIND_OPTIONS = [
  { value: 'product', label: 'Product' },
  { value: 'service', label: 'Service' },
];
