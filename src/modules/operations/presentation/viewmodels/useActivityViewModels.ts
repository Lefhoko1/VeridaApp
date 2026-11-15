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
import { industriesOf, useActiveBusiness } from '@/modules/business';

import type { ActivityInput } from '../../domain/models';
import { activityFormSchema, activityRuleProblem } from '../../domain/validation';
import { useOperationsDependencies } from '../di';

export function useActivityListViewModel() {
  const { activities, flocks } = useOperationsDependencies();
  const { business, can } = useActiveBusiness();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activityTypeId, setActivityTypeId] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const from = rangeStart(dateRange, todayIso());

  const types = useQuery({
    queryKey: ['platform', 'activity-types', ...industriesOf(business)],
    queryFn: () => activities.listTypes(industriesOf(business)),
    staleTime: Infinity,
  });
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
    typeOptions: [{ value: '', label: 'All activities' }, ...(types.data ?? []).map((type) => ({ value: type.id, label: type.name }))],
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
    quantity: prefill?.quantity ?? '',
    unit: '',
    flockId: '',
    notes: '',
  });
  const { reset, setValue } = form;

  const types = useQuery({
    queryKey: ['platform', 'activity-types', ...industriesOf(business)],
    queryFn: () => activities.listTypes(industriesOf(business)),
    staleTime: Infinity,
  });
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
      quantity: String(record.quantity),
      unit: record.unit,
      flockId: record.flockId ?? '',
      notes: record.notes ?? '',
    });
  }, [existing.data, reset]);

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

  const availableTypes = types.data;
  const suggestedActivity = prefill?.activity;
  const suggestedUnit = prefill?.unit;
  useEffect(() => {
    if (activityId || !availableTypes?.[0]) return;
    const suggested = availableTypes.find((type) => type.name.toLowerCase() === suggestedActivity?.toLowerCase());
    const chosen = suggested ?? availableTypes[0];
    setValue('activityTypeId', chosen.id);
    setValue('unit', suggestedUnit ?? chosen.defaultUnit);
  }, [activityId, availableTypes, suggestedActivity, suggestedUnit, setValue]);

  const selectedType = types.data?.find((type) => type.id === form.values.activityTypeId);

  const finish = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
    feedback.success(message);
    onDone();
  };
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: (input: ActivityInput) => (activityId ? activities.update(activityId, input) : activities.create(business.id, input)),
    onSuccess: () => {
      attachments.commit();
      return finish(activityId ? 'Record updated.' : 'Record saved.');
    },
    ...report,
  });

  const isVoided = existing.data?.status === 'voided';

  return {
    isEditing: Boolean(activityId),
    loading: types.isPending || (Boolean(activityId) && existing.isPending),
    loadError: existing.error ? errorMessage(existing.error) : null,
    isVoided,
    voidedReason: existing.data?.voidReason ?? null,
    form,
    typeOptions: (types.data ?? []).map((type) => ({ value: type.id, label: type.name })),
    selectType(typeId: string) {
      setValue('activityTypeId', typeId);
      const type = types.data?.find((item) => item.id === typeId);
      if (type) setValue('unit', type.defaultUnit);
    },
    typeDescription: selectedType?.description ?? '',
    showFlock: Boolean(selectedType?.usesFlock) && (flockList.data ?? []).length > 0,
    flockOptions: [
      { value: '', label: 'No specific flock' },
      ...(flockList.data ?? []).filter((flock) => flock.isActive).map((flock) => ({ value: flock.id, label: flock.name })),
    ],
    canSave: !isVoided && can(activityId ? 'records.edit' : 'records.create'),
    saving: save.isPending,
    receipt,
    submit() {
      const input = form.validate();
      if (!input) return;
      const problem = selectedType ? activityRuleProblem(selectedType, input) : null;
      if (problem) feedback.error(problem);
      else save.mutate({ ...input, receiptPaths: receipt.paths });
    },
  };
}

export function useActivityDetailViewModel(activityId: string) {
  const { activities, flocks } = useOperationsDependencies();
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

  const isVoided = detail.data?.status === 'voided';
  const receipts = useFileLinks(detail.data?.receiptPaths).files;

  return {
    loading: detail.isPending,
    error: detail.error ? errorMessage(detail.error) : null,
    record: detail.data ?? null,
    receipts,
    isVoided,
    flockName: flockList.data?.find((flock) => flock.id === detail.data?.flockId)?.name ?? null,
    canEdit: !isVoided && can('records.edit'),
    canVoid: !isVoided && can('records.void'),
    confirmingVoid,
    askToVoid: () => setConfirmingVoid(true),
    cancelVoid: () => setConfirmingVoid(false),
    voidReason,
    setVoidReason,
    voiding: voidRecord.isPending,
    confirmVoid: () => voidRecord.mutate(),
  };
}
