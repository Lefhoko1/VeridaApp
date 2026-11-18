import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { isPdf } from '@/core/files/types';
import { useAttachments } from '@/core/files/useAttachment';
import { todayIso } from '@/core/format/format';
import { useForm } from '@/core/forms/useForm';
import { businessScope } from '@/core/query/queryClient';
import { rangeStart, type DateRangeKey } from '@/core/time/dateRange';
import { useFeedback } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

import { ACTIVITY_STATUS_LABELS, type ActivityInput, type ActivityStatus, type ActivityType } from '../../domain/models';
import { activityFormSchema, activityRuleProblem, draftFromDetails, formatDetail, parseDetails, type DetailDraft } from '../../domain/validation';
import { useOperationsDependencies } from '../di';

export function useActivityTypes() {
  const { activities } = useOperationsDependencies();
  const { business } = useActiveBusiness();
  return useQuery({
    queryKey: [...businessScope(business.id), 'activity-types'],
    queryFn: () => activities.listTypes(business.id),
  });
}

// Options grouped for the pickers: each name with its group, such as "Mortality · Production".
const typeLabel = (type: ActivityType) => `${type.name} · ${type.groupName}`;

function useRelatedOptions(enabled: boolean) {
  const { related } = useOperationsDependencies();
  const { business, can } = useActiveBusiness();
  const scope = businessScope(business.id);
  // Each list is optional: someone who cannot see members or records still records activities.
  const quiet = async <T,>(load: () => Promise<T[]>): Promise<T[]> => load().catch(() => []);
  const members = useQuery({ queryKey: [...scope, 'members', 'options'], queryFn: () => quiet(() => related.members(business.id)), enabled: enabled && can('members.view') });
  const sales = useQuery({ queryKey: [...scope, 'sales', 'options'], queryFn: () => quiet(() => related.sales(business.id)), enabled });
  const expenses = useQuery({ queryKey: [...scope, 'expenses', 'options'], queryFn: () => quiet(() => related.expenses(business.id)), enabled });
  const products = useQuery({ queryKey: [...scope, 'products', 'options'], queryFn: () => quiet(() => related.products(business.id)), enabled });
  const withNone = (label: string, items: { id: string; label: string }[] | undefined) => [
    { value: '', label },
    ...(items ?? []).map((item) => ({ value: item.id, label: item.label })),
  ];
  return {
    members: withNone('Nobody in particular', members.data),
    sales: withNone('No linked sale', sales.data),
    expenses: withNone('No linked expense', expenses.data),
    products: withNone('No linked product', products.data),
    labelOf: (kind: 'members' | 'sales' | 'expenses' | 'products', id: string | null) => {
      if (!id) return null;
      const source = { members: members.data, sales: sales.data, expenses: expenses.data, products: products.data }[kind];
      return source?.find((item) => item.id === id)?.label ?? 'Linked record';
    },
  };
}

export function useActivityListViewModel() {
  const { activities, flocks } = useOperationsDependencies();
  const { business, can } = useActiveBusiness();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activityTypeId, setActivityTypeId] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const from = rangeStart(dateRange, todayIso());

  const types = useActivityTypes();
  const list = useQuery({
    queryKey: [...businessScope(business.id), 'activities', { search, activityTypeId, from }],
    queryFn: () => activities.list(business.id, { search, activityTypeId: activityTypeId || undefined, from }),
    enabled: can('records.view'),
  });
  const flockList = useQuery({
    queryKey: [...businessScope(business.id), 'flocks'],
    queryFn: () => flocks.list(business.id),
  });

  const flockNames = useMemo(() => new Map((flockList.data ?? []).map((flock) => [flock.id, flock.name])), [flockList.data]);

  return {
    // list uses isLoading, not isPending: it stays disabled for a deactivated business.
    loading: list.isLoading || types.isPending,
    refreshing: list.isRefetching,
    error: list.error ? errorMessage(list.error) : null,
    refresh: () => void queryClient.invalidateQueries({ queryKey: [...businessScope(business.id), 'activities'] }),
    items: list.data ?? [],
    flockNameOf: (flockId: string | null) => (flockId ? flockNames.get(flockId) ?? null : null),
    search,
    setSearch,
    activityTypeId,
    setActivityTypeId,
    dateRange,
    setDateRange: (value: string) => setDateRange(value as DateRangeKey),
    typeOptions: [{ value: '', label: 'All activities' }, ...(types.data ?? []).map((type) => ({ value: type.id, label: typeLabel(type) }))],
    statusLabel: (status: ActivityStatus) => ACTIVITY_STATUS_LABELS[status],
    canChooseActivities: can('business.manage'),
    canCreate: can('records.create'),
    // Flocks only apply to industries whose activity configuration uses them.
    usesFlocks: (types.data ?? []).some((type) => type.usesFlock),
  };
}

// FR-G18: values suggested by Ask Verida. The user still reviews and saves them (FR-G20).
export type ActivityPrefill = { activity?: string; quantity?: string; unit?: string; occurredOn?: string };

const NO_LINKS: Record<string, string> = {};

// Short-lived links to show a record's stored receipts.
function useFileLinks(paths: string[] | undefined) {
  const { files } = useOperationsDependencies();
  const { business } = useActiveBusiness();
  const wanted = paths ?? [];
  const links = useQuery({
    queryKey: [...businessScope(business.id), 'file-links', wanted],
    queryFn: () => files.linksFor(wanted),
    enabled: wanted.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  const map = links.data ?? NO_LINKS;
  return { links: map, files: wanted.flatMap((path) => (map[path] ? [{ url: map[path], isPdf: isPdf(path) }] : [])) };
}

export function useActivityFormViewModel({ activityId, prefill, onDone }: { activityId?: string; prefill?: ActivityPrefill; onDone: () => void }) {
  const { activities, flocks, files } = useOperationsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(activityFormSchema, {
    activityTypeId: '',
    occurredOn: prefill?.occurredOn ?? todayIso(),
    status: 'recorded',
    quantity: prefill?.quantity ?? '',
    unit: '',
    flockId: '',
    notes: '',
    responsibleUserId: '',
    saleId: '',
    expenseId: '',
    productId: '',
  });
  const { reset, setValue } = form;
  const [draft, setDraft] = useState<DetailDraft>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  const allTypes = useActivityTypes();
  const related = useRelatedOptions(true);
  const flockList = useQuery({
    queryKey: [...businessScope(business.id), 'flocks'],
    queryFn: () => flocks.list(business.id),
  });
  const existing = useQuery({
    queryKey: [...businessScope(business.id), 'activities', 'detail', activityId],
    queryFn: () => activities.get(activityId ?? ''),
    enabled: Boolean(activityId),
  });

  useEffect(() => {
    if (!existing.data) return;
    const record = existing.data;
    reset({
      activityTypeId: record.activityTypeId,
      occurredOn: record.occurredOn,
      status: record.status === 'planned' || record.status === 'in_progress' || record.status === 'requires_review' ? record.status : 'recorded',
      quantity: record.quantity === null ? '' : String(record.quantity),
      unit: record.unit ?? '',
      flockId: record.flockId ?? '',
      notes: record.notes ?? '',
      responsibleUserId: record.responsibleUserId ?? '',
      saleId: record.saleId ?? '',
      expenseId: record.expenseId ?? '',
      productId: record.productId ?? '',
    });
  }, [existing.data, reset]);

  // New records offer only switched-on types. An existing record keeps its own type.
  const types = useMemo(
    () => (allTypes.data ?? []).filter((type) => type.isEnabled || type.id === existing.data?.activityTypeId),
    [allTypes.data, existing.data?.activityTypeId],
  );
  const selectedType = types.find((type) => type.id === form.values.activityTypeId);
  const fields = useMemo(() => selectedType?.fields ?? [], [selectedType]);

  // The answers follow the chosen type, starting from the record's own when editing.
  const answersFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedType) return;
    const key = `${selectedType.id}:${existing.data?.id ?? 'new'}`;
    if (answersFor.current === key) return;
    answersFor.current = key;
    const stored = existing.data && existing.data.activityTypeId === selectedType.id ? existing.data.details : {};
    setDraft(draftFromDetails(selectedType.fields, stored));
    setDetailErrors({});
  }, [selectedType, existing.data]);

  const attachments = useAttachments({ store: files, businessId: business.id, folder: 'receipts', allowPdf: true });
  const existingPaths = existing.data?.receiptPaths;
  const existingLinks = useFileLinks(existingPaths);
  const { load } = attachments;
  // Load a record's receipts once, so a later refresh never drops ones the user just added.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!existingPaths) return;
    const key = existingPaths.join('|');
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    load(existingPaths, NO_LINKS);
  }, [existingPaths, load]);
  const receipt = {
    ...attachments,
    files: attachments.files.map((file) => (file.previewUri || file.isPdf ? file : { ...file, previewUri: existingLinks.links[file.path] ?? null })),
  };

  const availableTypes = allTypes.data ? types : undefined;
  const suggestedActivity = prefill?.activity;
  const suggestedUnit = prefill?.unit;
  useEffect(() => {
    if (activityId || !availableTypes?.[0]) return;
    const suggested = availableTypes.find((type) => type.name.toLowerCase() === suggestedActivity?.toLowerCase());
    const chosen = suggested ?? availableTypes[0];
    setValue('activityTypeId', chosen.id);
    setValue('unit', suggestedUnit ?? chosen.defaultUnit);
  }, [activityId, availableTypes, suggestedActivity, suggestedUnit, setValue]);

  const finish = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
    feedback.success(message);
    onDone();
  };
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: async (input: ActivityInput) => {
      if (!activityId) return activities.create(business.id, input);
      // The fields first, so that completing the activity checks the new answers.
      const { status, ...changes } = input;
      await activities.update(activityId, changes);
      if (status && status !== existing.data?.status) await activities.setStatus(activityId, status);
    },
    onSuccess: () => {
      attachments.commit();
      return finish(activityId ? 'Record updated.' : 'Record saved.');
    },
    ...report,
  });

  const isClosed = existing.data?.status === 'voided' || existing.data?.status === 'cancelled';
  const isVoided = isClosed;
  const completedBefore = existing.data?.status === 'recorded';

  return {
    isEditing: Boolean(activityId),
    loading: allTypes.isPending || (Boolean(activityId) && existing.isPending),
    loadError: existing.error ? errorMessage(existing.error) : null,
    isVoided,
    voidedReason: existing.data?.voidReason ?? null,
    form,
    typeOptions: types.map((type) => ({ value: type.id, label: typeLabel(type) })),
    selectType(typeId: string) {
      setValue('activityTypeId', typeId);
      const type = types.find((item) => item.id === typeId);
      if (type) setValue('unit', type.defaultUnit);
    },
    hasNoTypes: allTypes.isSuccess && types.length === 0,
    // A completed activity can only go to review here. Voiding is on its profile.
    statusOptions: (completedBefore ? (['recorded', 'requires_review'] as const) : (['recorded', 'planned', 'in_progress', 'requires_review'] as const)).map((value) => ({
      value,
      label: ACTIVITY_STATUS_LABELS[value],
    })),
    quantityMode: selectedType?.quantityMode ?? 'required',
    quantityLabel: selectedType?.quantityMode === 'optional' || form.values.status !== 'recorded' ? 'Quantity (optional)' : 'Quantity',
    fields,
    draft,
    detailErrors,
    setDetail(code: string, value: string | string[]) {
      setDraft((current) => ({ ...current, [code]: value }));
      setDetailErrors((current) => ({ ...current, [code]: '' }));
    },
    related,
    typeDescription: selectedType?.description ?? '',
    showFlock: Boolean(selectedType?.usesFlock) && (flockList.data ?? []).length > 0,
    flockOptions: [
      { value: '', label: 'No specific flock' },
      ...(flockList.data ?? []).filter((flock) => flock.isActive).map((flock) => ({ value: flock.id, label: flock.name })),
    ],
    canSave: !isClosed && can(activityId ? 'records.edit' : 'records.create'),
    saving: save.isPending,
    receipt,
    submit() {
      const input = form.validate();
      if (!input) return;
      const completed = input.status === 'recorded';
      const answers = parseDetails(fields, draft, completed);
      setDetailErrors(answers.errors);
      if (Object.keys(answers.errors).length > 0) return;
      const quantity = selectedType?.quantityMode === 'none' ? null : input.quantity;
      const problem = selectedType ? activityRuleProblem(selectedType, { ...input, quantity }) : null;
      if (problem) feedback.error(problem);
      else save.mutate({ ...input, quantity, unit: quantity === null ? null : input.unit, details: answers.details, receiptPaths: receipt.paths });
    },
  };
}

export function useActivityDetailViewModel(activityId: string) {
  const { activities, flocks } = useOperationsDependencies();
  const types = useActivityTypes();
  const related = useRelatedOptions(true);
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [voidReason, setVoidReason] = useState('');
  const [confirmingVoid, setConfirmingVoid] = useState(false);

  const detail = useQuery({
    queryKey: [...businessScope(business.id), 'activities', 'detail', activityId],
    queryFn: () => activities.get(activityId),
  });
  const flockList = useQuery({
    queryKey: [...businessScope(business.id), 'flocks'],
    queryFn: () => flocks.list(business.id),
  });
  const voidRecord = useMutation({
    mutationFn: () => activities.void(activityId, voidReason.trim()),
    onSuccess: async () => {
      setConfirmingVoid(false);
      await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
      feedback.success('Record voided. It no longer counts in your reports.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const changeStatus = useMutation({
    mutationFn: (status: Exclude<ActivityStatus, 'voided'>) => activities.setStatus(activityId, status),
    onSuccess: async (_result, status) => {
      await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
      feedback.success(status === 'recorded' ? 'Marked as completed. It now counts in your reports.' : `Marked as ${ACTIVITY_STATUS_LABELS[status].toLowerCase()}.`);
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const record = detail.data;
  const status = record?.status;
  const isVoided = status === 'voided' || status === 'cancelled';
  const receipts = useFileLinks(record?.receiptPaths).files;
  const type = types.data?.find((item) => item.id === record?.activityTypeId);
  // Answers to fields since removed from the form still show, under their stored name.
  const answers = record
    ? [
        ...(type?.fields ?? []).flatMap((field) => {
          const text = formatDetail(field, record.details[field.code]);
          return text === null ? [] : [{ label: field.label, value: text }];
        }),
        ...Object.entries(record.details)
          .filter(([code]) => !(type?.fields ?? []).some((field) => field.code === code))
          .map(([code, value]) => ({ label: code.replace(/_/g, ' '), value: Array.isArray(value) ? value.join(', ') : String(value) })),
      ]
    : [];

  return {
    loading: detail.isPending,
    error: detail.error ? errorMessage(detail.error) : null,
    record: detail.data ?? null,
    receipts,
    isVoided,
    flockName: flockList.data?.find((flock) => flock.id === detail.data?.flockId)?.name ?? null,
    canEdit: !isVoided && can('records.edit'),
    canVoid: (status === 'recorded' || status === 'requires_review') && can('records.void'),
    statusLabel: status ? ACTIVITY_STATUS_LABELS[status] : '',
    groupName: type?.groupName ?? null,
    answers,
    responsible: related.labelOf('members', record?.responsibleUserId ?? null),
    linkedSale: related.labelOf('sales', record?.saleId ?? null),
    linkedExpense: related.labelOf('expenses', record?.expenseId ?? null),
    linkedProduct: related.labelOf('products', record?.productId ?? null),
    // The next steps an open activity can take.
    canComplete: (status === 'planned' || status === 'in_progress' || status === 'requires_review') && can('records.edit'),
    canStart: status === 'planned' && can('records.edit'),
    canCancel: (status === 'planned' || status === 'in_progress' || status === 'requires_review') && can('records.edit'),
    changingStatus: changeStatus.isPending,
    complete: () => changeStatus.mutate('recorded'),
    start: () => changeStatus.mutate('in_progress'),
    cancel: () => changeStatus.mutate('cancelled'),
    confirmingVoid,
    askToVoid: () => setConfirmingVoid(true),
    cancelVoid: () => setConfirmingVoid(false),
    voidReason,
    setVoidReason,
    voiding: voidRecord.isPending,
    confirmVoid: () => voidRecord.mutate(),
  };
}

// Activity Catalogue section 7: an owner chooses which activities the business records.
export function useActivitySettingsViewModel() {
  const { activities } = useOperationsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const types = useActivityTypes();
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => activities.setTypeEnabled(business.id, id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...businessScope(business.id), 'activity-types'] }),
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const groups = new Map<string, { name: string; types: ActivityType[] }>();
  for (const type of types.data ?? []) {
    const group = groups.get(type.groupCode) ?? { name: type.groupName, types: [] };
    group.types.push(type);
    groups.set(type.groupCode, group);
  }

  return {
    loading: types.isPending,
    error: types.error ? errorMessage(types.error) : null,
    retry: () => void types.refetch(),
    canChange: can('business.manage'),
    busy: toggle.isPending,
    enabledCount: (types.data ?? []).filter((type) => type.isEnabled).length,
    groups: [...groups.entries()].map(([code, group]) => ({ code, ...group })),
    setEnabled: (id: string, enabled: boolean) => toggle.mutate({ id, enabled }),
  };
}
