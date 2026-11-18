import { rangeStart } from '@/core/time/dateRange';

import { categoryOptionLabel, saleTotal, toCategorySelectOptions } from './models';
import { expenseFormSchema, productFormSchema, saleFormSchema } from './validation';

describe('date filters (FR-C05)', () => {
  it('counts today as the first day of the range', () => {
    expect(rangeStart('last7', '2026-11-02')).toBe('2026-10-27');
    expect(rangeStart('last30', '2026-11-02')).toBe('2026-10-04');
  });

  it('applies no lower limit for all dates', () => {
    expect(rangeStart('all', '2026-11-02')).toBeUndefined();
  });

  it('crosses a year boundary', () => {
    expect(rangeStart('last7', '2027-01-03')).toBe('2026-12-28');
  });
});

const validSale = {
  occurredOn: '2026-11-02',
  productId: '',
  itemName: 'Egg tray',
  category: 'Egg sales',
  quantity: '2',
  unit: 'trays',
  unitPrice: '42',
  notes: '',
};

describe('sale total', () => {
  it('multiplies quantity by unit price', () => {
    expect(saleTotal(2, 42)).toBe(84);
  });

  it('rounds to cents without floating point drift', () => {
    expect(saleTotal(1.53, 42)).toBe(64.26);
    expect(saleTotal(0.1, 0.2)).toBe(0.02);
    expect(saleTotal(1.005, 1)).toBe(1.01);
  });
});

describe('sale form', () => {
  it('produces typed domain input', () => {
    expect(saleFormSchema.parse(validSale)).toEqual({
      occurredOn: '2026-11-02',
      productId: null,
      itemName: 'Egg tray',
      category: 'Egg sales',
      quantity: 2,
      unit: 'trays',
      unitPrice: 42,
      notes: null,
    });
  });

  it.each([
    ['itemName', ''],
    ['itemName', '   '],
    ['category', ''],
    ['quantity', '0'],
    ['quantity', '-1'],
    ['unitPrice', '-1'],
    ['unitPrice', ''],
    ['occurredOn', 'yesterday'],
  ])('rejects %s = "%s" (FR-C08)', (field, value) => {
    const result = saleFormSchema.safeParse({ ...validSale, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path[0]).toBe(field);
  });

  it('allows a free item', () => {
    expect(saleFormSchema.safeParse({ ...validSale, unitPrice: '0' }).success).toBe(true);
  });
});

describe('expense form', () => {
  const valid = { occurredOn: '2026-11-02', category: 'Feed', description: 'Layer mash', amount: '980', quantity: '', unit: '', certainty: 'recorded', notes: '' };

  it('keeps an unknown quantity as null', () => {
    expect(expenseFormSchema.parse(valid).quantity).toBeNull();
  });

  it('requires a known certainty (FR-C30)', () => {
    expect(expenseFormSchema.safeParse({ ...valid, certainty: 'maybe' }).success).toBe(false);
    expect(expenseFormSchema.parse({ ...valid, certainty: 'estimated' }).certainty).toBe('estimated');
  });
});

describe('product form', () => {
  it('requires a name, unit and price (FR-C36)', () => {
    const result = productFormSchema.safeParse({ kind: 'product', name: '', category: '', description: '', unit: '', sellingPrice: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(['name', 'unit', 'sellingPrice']));
    }
  });
});

describe('category labels (Business Taxonomy sections 3 and 4)', () => {
  it('shows the universal group only when it adds something', () => {
    expect(categoryOptionLabel({ name: 'Feed', groupCode: 'stock_materials', groupName: 'Stock and materials' })).toBe('Feed · Stock and materials');
    expect(categoryOptionLabel({ name: 'Stock and materials', groupCode: 'stock_materials', groupName: 'Stock and materials' })).toBe('Stock and materials');
    expect(categoryOptionLabel({ name: 'Vet visits', groupCode: null, groupName: null })).toBe('Vet visits');
  });

  it('keeps the name as the stored value', () => {
    expect(toCategorySelectOptions([{ name: 'Feed', groupCode: 'stock_materials', groupName: 'Stock and materials' }])).toEqual([{ value: 'Feed', label: 'Feed · Stock and materials' }]);
    expect(toCategorySelectOptions(undefined)).toEqual([]);
  });
});
