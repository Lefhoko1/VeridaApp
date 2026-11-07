import type { CategoryKind, Expense, ExpenseInput, Product, ProductInput, RecordFilter, Sale, SaleInput } from './models';

export interface SalesRepository {
  list(businessId: string, filter: RecordFilter): Promise<Sale[]>;
  get(id: string): Promise<Sale>;
  create(businessId: string, input: SaleInput): Promise<void>;
  // All rows are saved or none are.
  createMany(businessId: string, inputs: SaleInput[]): Promise<void>;
  update(id: string, input: SaleInput): Promise<void>;
  void(id: string, reason: string): Promise<void>;
}

export interface ExpenseRepository {
  list(businessId: string, filter: RecordFilter): Promise<Expense[]>;
  get(id: string): Promise<Expense>;
  create(businessId: string, input: ExpenseInput): Promise<void>;
  // All rows are saved or none are.
  createMany(businessId: string, inputs: ExpenseInput[]): Promise<void>;
  update(id: string, input: ExpenseInput): Promise<void>;
  void(id: string, reason: string): Promise<void>;
}

export interface ProductRepository {
  list(businessId: string, search?: string): Promise<Product[]>;
  get(id: string): Promise<Product>;
  create(businessId: string, input: ProductInput): Promise<void>;
  update(id: string, input: ProductInput): Promise<void>;
  setActive(id: string, isActive: boolean): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface CategoryRepository {
  list(businessId: string, kind: CategoryKind): Promise<string[]>;
  add(businessId: string, kind: CategoryKind, name: string): Promise<void>;
}
