export type RecordStatus = 'recorded' | 'voided';
export type ExpenseCertainty = 'recorded' | 'estimated' | 'incomplete';
export type CategoryKind = 'sale' | 'expense';

export type Sale = {
  id: string;
  occurredOn: string;
  productId: string | null;
  itemName: string;
  category: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  totalAmount: number;
  notes: string | null;
  status: RecordStatus;
  voidReason: string | null;
};

export type SaleInput = {
  occurredOn: string;
  productId: string | null;
  itemName: string;
  category: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  notes: string | null;
};

export type Expense = {
  id: string;
  occurredOn: string;
  category: string;
  description: string;
  amount: number;
  quantity: number | null;
  unit: string | null;
  certainty: ExpenseCertainty;
  notes: string | null;
  status: RecordStatus;
  voidReason: string | null;
};

export type ExpenseInput = {
  occurredOn: string;
  category: string;
  description: string;
  amount: number;
  quantity: number | null;
  unit: string | null;
  certainty: ExpenseCertainty;
  notes: string | null;
};

export type ProductKind = 'product' | 'service';

export type Product = {
  id: string;
  kind: ProductKind;
  name: string;
  category: string | null;
  description: string | null;
  unit: string;
  sellingPrice: number;
  isActive: boolean;
};

export type ProductInput = {
  kind: ProductKind;
  name: string;
  category: string | null;
  description: string | null;
  unit: string;
  sellingPrice: number;
};

export type RecordFilter = {
  search?: string;
  categories?: string[];
  from?: string;
  to?: string;
};

// FR-C21. Display preview only: the database generates the stored total.
export function saleTotal(quantity: number, unitPrice: number): number {
  return Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
}
