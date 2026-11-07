import { createDependencies } from '@/core/di/createDependencies';

import type { CategoryRepository, ExpenseRepository, ProductRepository, SalesRepository } from '../domain/repositories';

export type RecordsDependencies = {
  sales: SalesRepository;
  expenses: ExpenseRepository;
  products: ProductRepository;
  categories: CategoryRepository;
};

export const { Provider: RecordsDependenciesProvider, useDependencies: useRecordsDependencies } =
  createDependencies<RecordsDependencies>('Records');
