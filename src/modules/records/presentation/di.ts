import { createDependencies } from '@/core/di/createDependencies';
import type { BusinessFileStore } from '@/core/files/types';

import type { ReceiptReader } from '../domain/receipts';
import type { CategoryRepository, ExpenseRepository, ProductRepository, SalesRepository } from '../domain/repositories';

export type RecordsDependencies = {
  sales: SalesRepository;
  expenses: ExpenseRepository;
  products: ProductRepository;
  categories: CategoryRepository;
  files: BusinessFileStore;
  receipts: ReceiptReader;
};

export const { Provider: RecordsDependenciesProvider, useDependencies: useRecordsDependencies } =
  createDependencies<RecordsDependencies>('Records');
