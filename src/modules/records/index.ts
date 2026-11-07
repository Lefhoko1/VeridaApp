import type { SupabaseClient } from '@/core/supabase/client';

import { SupabaseExpenseRepository } from './data/SupabaseExpenseRepository';
import { SupabaseCategoryRepository, SupabaseProductRepository } from './data/SupabaseProductRepository';
import { SupabaseSalesRepository } from './data/SupabaseSalesRepository';
import type { RecordsDependencies } from './presentation/di';

export function createRecordsDependencies(client: SupabaseClient): RecordsDependencies {
  return {
    sales: new SupabaseSalesRepository(client),
    expenses: new SupabaseExpenseRepository(client),
    products: new SupabaseProductRepository(client),
    categories: new SupabaseCategoryRepository(client),
  };
}

export { RecordsDependenciesProvider } from './presentation/di';
export { ImportExpensesScreen, ImportSalesScreen } from './presentation/views/recordImportScreens';
export { ExpenseFormScreen, ProductFormScreen, SaleFormScreen } from './presentation/views/recordForms';
export { ExpenseProfileScreen, ProductProfileScreen, SaleProfileScreen } from './presentation/views/recordProfiles';
export { ExpenseList, ProductListScreen, SalesList } from './presentation/views/recordLists';
