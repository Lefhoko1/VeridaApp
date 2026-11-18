import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { useFeedback } from '@/design-system';

import type { FinanceCategoryConfig } from '../../domain/models';
import { financeCategorySchema } from '../../domain/validation';
import { useAdministrationDependencies } from '../di';

// Shares the industries scope so that a change here refreshes the business type screens too.
const scope = ['admin', 'industries'];
const listKey = [...scope, 'finance'];

export type FinanceKind = FinanceCategoryConfig['kind'];

// Main categories in order, each followed by its subcategories.
export function groupFinanceCategories(items: FinanceCategoryConfig[], kind: FinanceKind) {
  return items
    .filter((item) => item.kind === kind && item.parentCode === null)
    .map((category) => ({ category, subcategories: items.filter((item) => item.parentCode === category.code) }));
}

// Business Taxonomy sections 3 and 4.
export function useFinanceCategoryListViewModel() {
  const { industries } = useAdministrationDependencies();
  const list = useQuery({ queryKey: listKey, queryFn: () => industries.listFinanceCategories() });
  const items = list.data ?? [];
  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    sales: groupFinanceCategories(items, 'sale'),
    expenses: groupFinanceCategories(items, 'expense'),
  };
}

const toValues = (item: FinanceCategoryConfig) => ({
  code: item.code,
  kind: item.kind,
  parentCode: item.parentCode ?? '',
  name: item.name,
  description: item.description,
  sortOrder: String(item.sortOrder),
});

type Options = { code?: string; kind?: FinanceKind; parentCode?: string; onCreated: (code: string) => void };

export function useFinanceCategoryViewModel({ code, kind, parentCode, onCreated }: Options) {
  const { industries } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(financeCategorySchema, { code: '', kind: kind ?? 'expense', parentCode: parentCode ?? '', name: '', description: '', sortOrder: '100' });
  const { reset, values, setValue } = form;
  const [editingDetails, setEditingDetails] = useState(false);
  const enabled = Boolean(code);
  const category = useQuery({ queryKey: [...listKey, code], queryFn: () => industries.getFinanceCategory(code ?? ''), enabled });
  const all = useQuery({ queryKey: listKey, queryFn: () => industries.listFinanceCategories() });

  useEffect(() => {
    if (category.data) reset(toValues(category.data));
  }, [category.data, reset]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: scope });
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };
  const items = all.data ?? [];
  const subcategories = items.filter((item) => item.parentCode === code);

  const save = useMutation({
    mutationFn: async (input: { code: string; kind: FinanceKind; parentCode: string | null; name: string; description: string; sortOrder: number }) => {
      if (code) await industries.updateFinanceCategory(code, { ...input, isActive: category.data?.isActive ?? true });
      else await industries.createFinanceCategory({ ...input, isActive: true });
      return input.code;
    },
    onSuccess: async (saved) => {
      await refresh();
      setEditingDetails(false);
      feedback.success('Category saved.');
      if (!code) onCreated(saved);
    },
    ...report,
  });
  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) => {
      const current = category.data;
      if (!code || !current) throw new Error('Category not loaded.');
      return industries.updateFinanceCategory(code, { ...current, isActive });
    },
    onSuccess: async (_result, isActive) => {
      await refresh();
      feedback.success(isActive ? 'Category reactivated.' : 'Category deactivated. Records already using it keep it.');
    },
    ...report,
  });

  return {
    isNew: !code,
    editing: !code || editingDetails,
    startEditing: () => setEditingDetails(true),
    cancelEditing() {
      if (category.data) reset(toValues(category.data));
      setEditingDetails(false);
    },
    loading: enabled && category.isPending,
    error: category.error ? errorMessage(category.error) : null,
    isActive: category.data?.isActive ?? true,
    form,
    busy: save.isPending || toggleActive.isPending,
    save() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
    toggleActive: () => toggleActive.mutate(!(category.data?.isActive ?? true)),
    setKind(next: string) {
      setValue('kind', next as FinanceKind);
      setValue('parentCode', '');
    },
    // A main category of the same kind, or none. A category with subcategories stays a main one.
    canHaveParent: subcategories.length === 0,
    parentOptions: [
      { value: '', label: 'None: this is a main category' },
      ...items
        .filter((item) => item.kind === values.kind && item.parentCode === null && item.code !== code)
        .map((item) => ({ value: item.code, label: item.name })),
    ],
    parentName: items.find((item) => item.code === values.parentCode)?.name ?? 'None: this is a main category',
    subcategories,
  };
}
