import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useAttachment } from '@/core/files/useAttachment';
import { formatMoney } from '@/core/format/format';
import { useForm } from '@/core/forms/useForm';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

import type { Product, ProductInput } from '../../domain/models';
import { productFormSchema } from '../../domain/validation';
import { useRecordsDependencies } from '../di';
import { useFileLink } from './useReceipt';

export function useProductListViewModel() {
  const { products, files } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const [search, setSearch] = useState('');

  const list = useQuery({
    queryKey: [...businessScope(business.id), 'products', 'list', { search }],
    queryFn: () => products.list(business.id, search),
  });
  const imagePaths = (list.data ?? []).flatMap((product) => (product.imagePath ? [product.imagePath] : []));
  // A photo that cannot be linked just shows the item's icon instead.
  const imageLinks = useQuery({
    queryKey: [...businessScope(business.id), 'file-links', imagePaths],
    queryFn: () => files.linksFor(imagePaths).catch(() => ({}) as Record<string, string>),
    enabled: imagePaths.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    items: list.data ?? [],
    imageFor: (product: Product) => (product.imagePath ? (imageLinks.data?.[product.imagePath] ?? null) : null),
    search,
    setSearch,
    canManage: can('products.manage'),
    money: (amount: number) => formatMoney(amount, business.currency),
  };
}

export function useProductFormViewModel({ productId, onDone }: { productId?: string; onDone: () => void }) {
  const { products, files } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const image = useAttachment({ store: files, businessId: business.id, folder: 'products' });
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

  const existingImage = useFileLink(existing.data?.imagePath);
  const { load } = image;
  useEffect(() => {
    if (existing.data) load(existing.data.imagePath, existingImage.url);
  }, [existing.data, existingImage.url, load]);

  const finish = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
    feedback.success(message);
    onDone();
  };
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: (input: ProductInput) => (productId ? products.update(productId, input) : products.create(business.id, input)),
    onSuccess: () => {
      image.commit();
      return finish(productId ? 'Product updated.' : 'Product added.');
    },
    ...report,
  });

  return {
    isEditing: Boolean(productId),
    loading: Boolean(productId) && existing.isPending,
    loadError: existing.error ? errorMessage(existing.error) : null,
    form,
    canManage: can('products.manage'),
    busy: save.isPending,
    image,
    submit() {
      const input = form.validate();
      if (input) save.mutate({ ...input, imagePath: image.path });
    },
  };
}

export function useProductDetailViewModel({ productId, onRemoved }: { productId: string; onRemoved: () => void }) {
  const { products, files } = useRecordsDependencies();
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
    mutationFn: async () => {
      const imagePath = detail.data?.imagePath;
      await products.remove(productId);
      // The photo goes with the item. If that fails the item is still deleted.
      if (imagePath) await files.remove(imagePath).catch(() => undefined);
    },
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
  const image = useFileLink(detail.data?.imagePath);

  return {
    loading: detail.isPending,
    error: detail.error ? errorMessage(detail.error) : null,
    product: detail.data ?? null,
    image,
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
