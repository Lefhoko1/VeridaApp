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

import { saleTotal, type Sale, type SaleInput } from '../../domain/models';
import { saleFormSchema } from '../../domain/validation';
import { useRecordsDependencies } from '../di';
import { useFileLinks, useReceipts } from './useReceipt';
import { useRecordFilters } from './useRecordFilters';

const NEW_SALE = {
  occurredOn: '',
  productId: '',
  itemName: '',
  category: '',
  quantity: '1',
  unit: '',
  unitPrice: '',
  notes: '',
};

export function useSalesListViewModel() {
  const { sales } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const filters = useRecordFilters(business.id, 'sale');

  const list = useQuery({
    queryKey: [...businessScope(business.id), 'sales', filters.filter],
    queryFn: () => sales.list(business.id, filters.filter),
    enabled: can('records.view'),
  });

  const exportCsv = useMutation({
    mutationFn: () =>
      shareTextFile(
        'verida_sales.csv',
        toCsv(
          ['Date', 'Item', 'Category', 'Quantity', 'Unit', 'Unit price', 'Total', 'Status', 'Notes'],
          (list.data ?? []).map((sale) => [sale.occurredOn, sale.itemName, sale.category, sale.quantity, sale.unit, sale.unitPrice, sale.totalAmount, sale.status, sale.notes]),
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
    refresh: () => void queryClient.invalidateQueries({ queryKey: [...businessScope(business.id), 'sales'] }),
    items: list.data ?? [],
    filters,
    canCreate: can('records.create'),
    money: (amount: number) => formatMoney(amount, business.currency),
    exportCsv: () => exportCsv.mutate(),
  };
}

// FR-G18: values suggested by Ask Verida. The user still reviews and saves them (FR-G20).
export type SalePrefill = { itemName?: string; category?: string; quantity?: string; unit?: string; unitPrice?: string; occurredOn?: string };

export function useSaleFormViewModel({ saleId, prefill, onDone }: { saleId?: string; prefill?: SalePrefill; onDone: () => void }) {
  const { sales, categories, products } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(saleFormSchema, { ...NEW_SALE, occurredOn: todayIso(), ...prefill });
  const { reset, setValue } = form;

  const existing = useQuery({
    queryKey: [...businessScope(business.id), 'sales', 'detail', saleId],
    queryFn: () => sales.get(saleId ?? ''),
    enabled: Boolean(saleId),
  });
  const categoryOptions = useQuery({
    queryKey: [...businessScope(business.id), 'categories', 'sale'],
    queryFn: () => categories.list(business.id, 'sale'),
  });
  const productOptions = useQuery({
    queryKey: [...businessScope(business.id), 'products', 'active'],
    queryFn: async () => (await products.list(business.id)).filter((product) => product.isActive),
  });

  useEffect(() => {
    if (existing.data) reset(toFormValues(existing.data));
  }, [existing.data, reset]);

  const receipt = useReceipts({
    kind: 'sale',
    existingPaths: saleId ? existing.data?.receiptPaths : undefined,
    categories: categoryOptions.data ?? [],
    apply(reading) {
      if (reading.occurredOn) setValue('occurredOn', reading.occurredOn);
      const item = reading.description ?? reading.vendor;
      if (item) setValue('itemName', item);
      const category = categoryOptions.data?.find((name) => name.toLowerCase() === reading.category?.toLowerCase());
      if (category) setValue('category', category);
      if (reading.unit) setValue('unit', reading.unit);
      // A receipt often shows only a total: record it as one item at that price.
      const quantity = reading.quantity ?? (reading.total !== null ? 1 : null);
      const unitPrice = reading.unitPrice ?? (reading.total !== null && quantity ? Math.round((reading.total / quantity) * 100) / 100 : null);
      if (quantity !== null) setValue('quantity', String(quantity));
      if (unitPrice !== null) setValue('unitPrice', String(unitPrice));
    },
  });

  // Default a new sale to the industry's first category once the options load.
  const availableCategories = categoryOptions.data;
  const suggestedCategory = prefill?.category;
  useEffect(() => {
    if (saleId || !availableCategories?.[0]) return;
    const suggested = availableCategories.find((name) => name.toLowerCase() === suggestedCategory?.toLowerCase());
    setValue('category', suggested ?? availableCategories[0]);
  }, [saleId, availableCategories, suggestedCategory, setValue]);

  const finish = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
    feedback.success(message);
    onDone();
  };
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: async (input: SaleInput) => {
      if (saleId) await sales.update(saleId, input);
      else await sales.create(business.id, input);
      // A category typed under "Other" joins the list for next time. The sale is saved either way.
      if (!categoryOptions.data?.includes(input.category)) await categories.add(business.id, 'sale', input.category).catch(() => undefined);
    },
    onSuccess: () => {
      receipt.commit();
      return finish(saleId ? 'Sale updated.' : 'Sale recorded.');
    },
    ...report,
  });

  const quantity = Number(form.values.quantity);
  const unitPrice = Number(form.values.unitPrice);
  const isVoided = existing.data?.status === 'voided';

  return {
    isEditing: Boolean(saleId),
    loading: Boolean(saleId) && existing.isPending,
    loadError: existing.error ? errorMessage(existing.error) : null,
    isVoided,
    voidedReason: existing.data?.voidReason ?? null,
    form,
    categoryOptions: (categoryOptions.data ?? []).map((value) => ({ value, label: value })),
    productOptions: [
      { value: '', label: 'Not in my catalogue' },
      ...(productOptions.data ?? []).map((product) => ({ value: product.id, label: product.name })),
    ],
    // Choosing a catalogue item fills in its name, unit and selling price.
    selectProduct(productId: string) {
      setValue('productId', productId);
      const product = productOptions.data?.find((item) => item.id === productId);
      if (product) {
        setValue('itemName', product.name);
        setValue('unit', product.unit);
        setValue('unitPrice', String(product.sellingPrice));
      }
    },
    totalPreview: formatMoney(Number.isFinite(quantity * unitPrice) ? saleTotal(quantity, unitPrice) : 0, business.currency),
    canSave: !isVoided && can(saleId ? 'records.edit' : 'records.create'),
    saving: save.isPending,
    receipt,
    submit() {
      const input = form.validate();
      if (input) save.mutate({ ...input, receiptPaths: receipt.paths });
    },
  };
}

export function useSaleDetailViewModel(saleId: string) {
  const { sales } = useRecordsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [voidReason, setVoidReason] = useState('');
  const [confirmingVoid, setConfirmingVoid] = useState(false);

  const detail = useQuery({
    queryKey: [...businessScope(business.id), 'sales', 'detail', saleId],
    queryFn: () => sales.get(saleId),
  });
  const voidSale = useMutation({
    mutationFn: () => sales.void(saleId, voidReason.trim()),
    onSuccess: async () => {
      setConfirmingVoid(false);
      await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
      feedback.success('Sale voided. It no longer counts in your reports.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const isVoided = detail.data?.status === 'voided';
  const receiptLinks = useFileLinks(detail.data?.receiptPaths);

  return {
    loading: detail.isPending,
    error: detail.error ? errorMessage(detail.error) : null,
    sale: detail.data ?? null,
    receipts: receiptLinks.files,
    isVoided,
    money: (amount: number) => formatMoney(amount, business.currency),
    canEdit: !isVoided && can('records.edit'),
    canVoid: !isVoided && can('records.void'),
    confirmingVoid,
    askToVoid: () => setConfirmingVoid(true),
    cancelVoid: () => setConfirmingVoid(false),
    voidReason,
    setVoidReason,
    voiding: voidSale.isPending,
    confirmVoid: () => voidSale.mutate(),
  };
}

function toFormValues(sale: Sale) {
  return {
    occurredOn: sale.occurredOn,
    productId: sale.productId ?? '',
    itemName: sale.itemName,
    category: sale.category,
    quantity: String(sale.quantity),
    unit: sale.unit ?? '',
    unitPrice: String(sale.unitPrice),
    notes: sale.notes ?? '',
  };
}
