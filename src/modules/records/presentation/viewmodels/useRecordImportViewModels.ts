import { useQueryClient } from '@tanstack/react-query';

import { todayIso } from '@/core/format/format';
import { analyseImport } from '@/core/import/analyseImport';
import { useCsvImport } from '@/core/import/useCsvImport';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

import type { ExpenseInput, SaleInput } from '../../domain/models';
import { expenseFormSchema, saleFormSchema } from '../../domain/validation';
import { useRecordsDependencies } from '../di';

export const SALES_IMPORT = {
  columns: 'date, item, category, quantity, unit (optional), unit price, notes (optional)',
  example: 'date,item,category,quantity,unit,unit price\n2026-10-05,Egg tray,Egg sales,2,trays,42',
};

export const EXPENSES_IMPORT = {
  columns: 'date, category, description, amount, quantity (optional), unit (optional), certainty (optional), notes (optional)',
  example: 'date,category,description,amount\n2026-10-05,Feed,Layer mash,980',
};

function useImportFeedback(businessId: string, onDone: () => void) {
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  return (count: number) => {
    void queryClient.invalidateQueries({ queryKey: businessScope(businessId) });
    feedback.success(`${count} records imported.`);
    onDone();
  };
}

// The app's own export uses these same column names, so an export can be imported again.
export function useSalesImportViewModel(onDone: () => void) {
  const { sales } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const onCommitted = useImportFeedback(business.id, onDone);
  const flow = useCsvImport<SaleInput>({
    analyse: (text) =>
      analyseImport(text, {
        columns: { date: 'occurredOn', item: 'itemName', category: 'category', quantity: 'quantity', unit: 'unit', 'unit price': 'unitPrice', notes: 'notes' },
        requiredColumns: ['date', 'item', 'category', 'quantity', 'unit price'],
        defaults: { productId: '', occurredOn: todayIso() },
        schema: saleFormSchema,
      }),
    commit: (rows) => sales.createMany(business.id, rows),
    onCommitted,
  });
  return { ...flow, ...SALES_IMPORT, canImport: can('records.create') };
}

export function useExpensesImportViewModel(onDone: () => void) {
  const { expenses } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const onCommitted = useImportFeedback(business.id, onDone);
  const flow = useCsvImport<ExpenseInput>({
    analyse: (text) =>
      analyseImport(text, {
        columns: { date: 'occurredOn', category: 'category', description: 'description', amount: 'amount', quantity: 'quantity', unit: 'unit', certainty: 'certainty', notes: 'notes' },
        requiredColumns: ['date', 'category', 'description', 'amount'],
        defaults: { certainty: 'recorded', occurredOn: todayIso() },
        schema: expenseFormSchema,
      }),
    commit: (rows) => expenses.createMany(business.id, rows),
    onCommitted,
  });
  return { ...flow, ...EXPENSES_IMPORT, canImport: can('records.create') };
}
