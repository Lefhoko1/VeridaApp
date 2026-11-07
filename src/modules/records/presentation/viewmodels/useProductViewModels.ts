import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { formatMoney } from '@/core/format/format';
import { useForm } from '@/core/forms/useForm';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

import type { Product, ProductInput } from '../../domain/models';
import { productFormSchema } from '../../domain/validation';
import { useRecordsDependencies } from '../di';

export function useProductListViewModel() {
  const { products } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const [search, setSearch] = useState('');

  const list = useQuery({
    queryKey: [...businessScope(business.id), 'products', 'list', { search }],
    queryFn: () => products.list(business.id, search),
  });

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    items: list.data ?? [],
    search,
    setSearch,
    canManage: can('products.manage'),
    money: (amount: number) => formatMoney(amount, business.currency),
  };
}

export function useProductFormViewModel({ productId, onDone }: { productId?: string; onDone: () => void }) {
  const { products } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(productFormSchema, { kind: 'product', name: '', category: '', description: '', unit: '', sellingPrice: '' });
  const { reset } = form;

  const existing = useQuery({
    queryKey: [...businessScope(business.id), 'products', 'detail', productId],
    queryFn: () => products.get(productId ?? ''),
    enabled: Boolean(productId),
  });

  useEffect(() => {
    if (existing.data) reset(toFormValues(existing.data));
  }, [existing.data, reset]);

  const finish = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
    feedback.success(message);
    onDone();
  };
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: (input: ProductInput) => (productId ? products.update(productId, input) : products.create(business.id, input)),
    onSuccess: () => finish(productId ? 'Product updated.' : 'Product added.'),
    ...report,
  });

  return {
    isEditing: Boolean(productId),
    loading: Boolean(productId) && existing.isPending,
    loadError: existing.error ? errorMessage(existing.error) : null,
    form,
    canManage: can('products.manage'),
    busy: save.isPending,
    submit() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
  };
}

export function useProductDetailViewModel({ productId, onRemoved }: { productId: string; onRemoved: () => void }) {
  const { products } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const detail = useQuery({
    queryKey: [...businessScope(business.id), 'products', 'detail', productId],
    queryFn: () => products.get(productId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: businessScope(business.id) });

  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) => products.setActive(productId, isActive),
    onSuccess: async (_result, isActive) => {
      await refresh();
      feedback.success(isActive ? 'Product reactivated.' : 'Product deactivated.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => products.remove(productId),
    onSuccess: async () => {
      await refresh();
      feedback.success('Product deleted.');
      onRemoved();
    },
    onError: (error) => {
      setConfirmingRemove(false);
      feedback.error(errorMessage(error));
    },
  });

  const isActive = detail.data?.isActive ?? true;

  return {
    loading: detail.isPending,
    error: detail.error ? errorMessage(detail.error) : null,
    product: detail.data ?? null,
    isActive,
    money: (amount: number) => formatMoney(amount, business.currency),
    canManage: can('products.manage'),
    busy: toggleActive.isPending || remove.isPending,
    toggleActive: () => toggleActive.mutate(!isActive),
    confirmingRemove,
    askToRemove: () => setConfirmingRemove(true),
    cancelRemove: () => setConfirmingRemove(false),
    confirmRemove: () => remove.mutate(),
  };
}

function toFormValues(product: Product) {
  return {
    kind: product.kind as string,
    name: product.name,
    category: product.category ?? '',
    description: product.description ?? '',
    unit: product.unit,
    sellingPrice: String(product.sellingPrice),
  };
}
