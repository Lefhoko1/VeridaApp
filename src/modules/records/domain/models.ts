export type RecordStatus = 'recorded' | 'voided';
export type ExpenseCertainty = 'recorded' | 'estimated' | 'incomplete';
export type CategoryKind = 'sale' | 'expense';

// A category a record can take, with the universal category it is reported under
// (Business Taxonomy sections 3 and 4). A typed category has no group yet.
export type CategoryOption = { name: string; groupCode: string | null; groupName: string | null };

// The group is shown only when it adds something, so Feed reads "Feed · Stock and materials".
export const categoryOptionLabel = (option: CategoryOption): string =>
  option.groupName && option.groupName.toLowerCase() !== option.name.toLowerCase() ? `${option.name} · ${option.groupName}` : option.name;

export const toCategorySelectOptions = (options: CategoryOption[] | undefined) =>
  (options ?? []).map((option) => ({ value: option.name, label: categoryOptionLabel(option) }));

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
  // Where the receipts or other evidence are stored, if any were attached.
  receiptPaths: string[];
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
  // Left out by imports, which never carry a receipt.
  receiptPaths?: string[];
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
  receiptPaths: string[];
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
  receiptPaths?: string[];
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
  imagePath: string | null;
};

export type ProductInput = {
  kind: ProductKind;
  name: string;
  category: string | null;
  description: string | null;
  unit: string;
  sellingPrice: number;
  imagePath?: string | null;
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
