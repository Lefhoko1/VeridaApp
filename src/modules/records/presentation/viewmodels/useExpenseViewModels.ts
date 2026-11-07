import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { toCsv } from '@/core/export/csv';
import { shareTextFile } from '@/core/export/shareFile';
import { formatMoney, todayIso } from '@/core/format/format';
import { useForm } from '@/core/forms/useForm';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

import type { Expense, ExpenseInput } from '../../domain/models';
import { expenseFormSchema } from '../../domain/validation';
import { useRecordsDependencies } from '../di';
import { useRecordFilters } from './useRecordFilters';

export function useExpenseListViewModel() {
  const { expenses } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const filters = useRecordFilters(business.id, 'expense');

  const list = useQuery({
    queryKey: [...businessScope(business.id), 'expenses', filters.filter],
    queryFn: () => expenses.list(business.id, filters.filter),
    enabled: can('records.view'),
  });

  const exportCsv = useMutation({
    mutationFn: () =>
      shareTextFile(
        'verida_expenses.csv',
        toCsv(
          ['Date', 'Category', 'Description', 'Amount', 'Quantity', 'Unit', 'Certainty', 'Status', 'Notes'],
          (list.data ?? []).map((item) => [item.occurredOn, item.category, item.description, item.amount, item.quantity, item.unit, item.certainty, item.status, item.notes]),
        ),
        'text/csv',
      ),
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    // isLoading, not isPending: the query stays disabled for a deactivated business.
    loading: list.isLoading,
    refreshing: list.isRefetching,
    error: list.error ? errorMessage(list.error) : null,
    refresh: () => void queryClient.invalidateQueries({ queryKey: [...businessScope(business.id), 'expenses'] }),
    items: list.data ?? [],
    filters,
    canCreate: can('records.create'),
    money: (amount: number) => formatMoney(amount, business.currency),
    exportCsv: () => exportCsv.mutate(),
  };
}

// FR-G18: values suggested by Ask Verida. The user still reviews and saves them (FR-G20).
export type ExpensePrefill = { category?: string; description?: string; amount?: string; quantity?: string; unit?: string; occurredOn?: string };

export function useExpenseFormViewModel({ expenseId, prefill, onDone }: { expenseId?: string; prefill?: ExpensePrefill; onDone: () => void }) {
  const { expenses, categories } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(expenseFormSchema, {
    occurredOn: todayIso(),
    category: '',
    description: '',
    amount: '',
    quantity: '',
    unit: '',
    certainty: 'recorded',
    notes: '',
    ...prefill,
  });
  const { reset, setValue } = form;

  const categoriesKey = [...businessScope(business.id), 'categories', 'expense'];

  const existing = useQuery({
    queryKey: [...businessScope(business.id), 'expenses', 'detail', expenseId],
    queryFn: () => expenses.get(expenseId ?? ''),
    enabled: Boolean(expenseId),
  });
  const categoryOptions = useQuery({
    queryKey: categoriesKey,
    queryFn: () => categories.list(business.id, 'expense'),
  });

  useEffect(() => {
    if (existing.data) reset(toFormValues(existing.data));
  }, [existing.data, reset]);

  const availableCategories = categoryOptions.data;
  const suggestedCategory = prefill?.category;
  useEffect(() => {
    if (expenseId || !availableCategories?.[0]) return;
    const suggested = availableCategories.find((name) => name.toLowerCase() === suggestedCategory?.toLowerCase());
    setValue('category', suggested ?? availableCategories[0]);
  }, [expenseId, availableCategories, suggestedCategory, setValue]);

  const finish = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
    feedback.success(message);
    onDone();
  };
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: async (input: ExpenseInput) => {
      if (expenseId) await expenses.update(expenseId, input);
      else await expenses.create(business.id, input);
      // A category typed under "Other" joins the list for next time. The expense is saved either way.
      if (!categoryOptions.data?.includes(input.category)) await categories.add(business.id, 'expense', input.category).catch(() => undefined);
    },
    onSuccess: () => finish(expenseId ? 'Expense updated.' : 'Expense recorded.'),
    ...report,
  });

  const isVoided = existing.data?.status === 'voided';

  return {
    isEditing: Boolean(expenseId),
    loading: Boolean(expenseId) && existing.isPending,
    loadError: existing.error ? errorMessage(existing.error) : null,
    isVoided,
    voidedReason: existing.data?.voidReason ?? null,
    form,
    categoryOptions: (categoryOptions.data ?? []).map((value) => ({ value, label: value })),
    canSave: !isVoided && can(expenseId ? 'records.edit' : 'records.create'),
    saving: save.isPending,
    submit() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
  };
}

export function useExpenseDetailViewModel(expenseId: string) {
  const { expenses } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [voidReason, setVoidReason] = useState('');
  const [confirmingVoid, setConfirmingVoid] = useState(false);

  const detail = useQuery({
    queryKey: [...businessScope(business.id), 'expenses', 'detail', expenseId],
    queryFn: () => expenses.get(expenseId),
  });
  const voidExpense = useMutation({
    mutationFn: () => expenses.void(expenseId, voidReason.trim()),
    onSuccess: async () => {
      setConfirmingVoid(false);
      await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
      feedback.success('Expense voided. It no longer counts in your reports.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const isVoided = detail.data?.status === 'voided';

  return {
    loading: detail.isPending,
    error: detail.error ? errorMessage(detail.error) : null,
    expense: detail.data ?? null,
    isVoided,
    money: (amount: number) => formatMoney(amount, business.currency),
    canEdit: !isVoided && can('records.edit'),
    canVoid: !isVoided && can('records.void'),
    confirmingVoid,
    askToVoid: () => setConfirmingVoid(true),
    cancelVoid: () => setConfirmingVoid(false),
    voidReason,
    setVoidReason,
    voiding: voidExpense.isPending,
    confirmVoid: () => voidExpense.mutate(),
  };
}

function toFormValues(expense: Expense) {
  return {
    occurredOn: expense.occurredOn,
    category: expense.category,
    description: expense.description,
    amount: String(expense.amount),
    quantity: expense.quantity === null ? '' : String(expense.quantity),
    unit: expense.unit ?? '',
    certainty: expense.certainty as string,
    notes: expense.notes ?? '',
  };
}
