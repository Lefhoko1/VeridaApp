import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { useFeedback } from '@/design-system';

import type { ActivityTypeConfig, ActivityTypeInput, BusinessCategoryConfig, IndustryConfig, KpiDefinition } from '../../domain/models';
import { activityTypeSchema, businessCategorySchema, categoryNameSchema, industrySchema, kpiSchema } from '../../domain/validation';
import { useAdministrationDependencies } from '../di';

const scope = ['admin', 'industries'];

// The taxonomy as staff see it: every category, inactive ones included, with its business types.
export function useIndustryListViewModel() {
  const { industries } = useAdministrationDependencies();
  const list = useQuery({ queryKey: [...scope, 'list'], queryFn: () => industries.listIndustries() });
  const categories = useQuery({ queryKey: [...scope, 'categories'], queryFn: () => industries.listBusinessCategories() });
  const failure = list.error ?? categories.error;
  return {
    loading: list.isPending || categories.isPending,
    error: failure ? errorMessage(failure) : null,
    retry() {
      void list.refetch();
      void categories.refetch();
    },
    groups: groupByCategory(categories.data ?? [], list.data ?? []),
  };
}

export function groupByCategory(categories: BusinessCategoryConfig[], items: IndustryConfig[]) {
  const known = new Set(categories.map((category) => category.code));
  const groups: { category: BusinessCategoryConfig | null; items: IndustryConfig[] }[] = categories.map((category) => ({
    category,
    items: items.filter((item) => item.categoryCode === category.code),
  }));
  const orphans = items.filter((item) => !known.has(item.categoryCode));
  return orphans.length > 0 ? [...groups, { category: null, items: orphans }] : groups;
}

const toCategoryValues = (item: BusinessCategoryConfig) => ({
  code: item.code,
  name: item.name,
  description: item.description,
  icon: item.icon,
  sortOrder: String(item.sortOrder),
});

// FR-I01: one main category of the taxonomy.
export function useBusinessCategoryViewModel({ code, onCreated }: { code?: string; onCreated: (code: string) => void }) {
  const { industries } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(businessCategorySchema, { code: '', name: '', description: '', icon: 'storefront-outline', sortOrder: '100' });
  const { reset } = form;
  const [editingDetails, setEditingDetails] = useState(false);
  const enabled = Boolean(code);
  const category = useQuery({ queryKey: [...scope, 'category', code], queryFn: () => industries.getBusinessCategory(code ?? ''), enabled });
  const types = useQuery({ queryKey: [...scope, 'list'], queryFn: () => industries.listIndustries(), enabled });

  useEffect(() => {
    if (category.data) reset(toCategoryValues(category.data));
  }, [category.data, reset]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: scope });
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: async (input: { code: string; name: string; description: string; icon: string; sortOrder: number }) => {
      if (code) await industries.updateBusinessCategory(code, { ...input, isActive: category.data?.isActive ?? true });
      else await industries.createBusinessCategory({ ...input, isActive: true });
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
      return industries.updateBusinessCategory(code, { ...current, isActive });
    },
    onSuccess: async (_result, isActive) => {
      await refresh();
      feedback.success(isActive ? 'Category reactivated.' : 'Category deactivated. New businesses can no longer choose its types.');
    },
    ...report,
  });

  return {
    isNew: !code,
    editing: !code || editingDetails,
    startEditing: () => setEditingDetails(true),
    cancelEditing() {
      if (category.data) reset(toCategoryValues(category.data));
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
    types: (types.data ?? []).filter((item) => item.categoryCode === code),
  };
}

const NEW_ACTIVITY = { code: '', name: '', description: '', defaultUnit: '', usesFlock: 'no', allowsNegative: 'no', minQuantity: '', maxQuantity: '', wholeNumbersOnly: 'no', notesRequired: 'no', allowedUnits: '' };

// FR-I01 to FR-I07.
export function useIndustryDetailViewModel({ code, categoryCode, onCreated }: { code?: string; categoryCode?: string; onCreated: (code: string) => void }) {
  const { industries } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(industrySchema, { code: '', categoryCode: categoryCode ?? '', name: '', shortName: '', description: '', icon: 'storefront-outline', chartTitle: '' });
  const activityForm = useForm(activityTypeSchema, NEW_ACTIVITY);
  const { reset } = form;
  const [categoryName, setCategoryName] = useState('');
  const [categoryKind, setCategoryKind] = useState<'sale' | 'expense'>('expense');
  const [categoryError, setCategoryError] = useState<string | undefined>();
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);

  const detailKey = [...scope, 'detail', code];
  const enabled = Boolean(code);

  const industry = useQuery({ queryKey: detailKey, queryFn: () => industries.getIndustry(code ?? ''), enabled });
  const businessCategories = useQuery({ queryKey: [...scope, 'categories'], queryFn: () => industries.listBusinessCategories() });
  const categories = useQuery({ queryKey: [...detailKey, 'categories'], queryFn: () => industries.listCategories(code ?? ''), enabled });
  const activities = useQuery({ queryKey: [...detailKey, 'activities'], queryFn: () => industries.listActivityTypes(code ?? ''), enabled });
  const kpis = useQuery({ queryKey: [...scope, 'kpis'], queryFn: () => industries.listKpiDefinitions(), enabled });
  const assigned = useQuery({ queryKey: [...detailKey, 'kpis'], queryFn: () => industries.listIndustryKpis(code ?? ''), enabled });

  useEffect(() => {
    if (!industry.data) return;
    const { code: industryCode, categoryCode: category, name, shortName, description, icon, chartTitle } = industry.data;
    reset({ code: industryCode, categoryCode: category, name, shortName, description, icon, chartTitle });
  }, [industry.data, reset]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: scope });
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: async (input: { code: string; categoryCode: string; name: string; shortName: string; description: string; icon: string; chartTitle: string }) => {
      if (code) await industries.updateIndustry(code, { ...input, sortOrder: industry.data?.sortOrder ?? 0, isActive: industry.data?.isActive ?? true });
      else await industries.createIndustry({ ...input, sortOrder: 100, isActive: true });
      return input.code;
    },
    onSuccess: async (saved) => {
      await refresh();
      feedback.success('Industry saved.');
      if (!code) onCreated(saved);
    },
    ...report,
  });
  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) => {
      const current = industry.data;
      if (!code || !current) throw new Error('Industry not loaded.');
      return industries.updateIndustry(code, { ...current, isActive });
    },
    onSuccess: async (_result, isActive) => {
      await refresh();
      feedback.success(isActive ? 'Industry reactivated.' : 'Industry deactivated. New businesses can no longer choose it.');
    },
    ...report,
  });
  const addCategory = useMutation({
    mutationFn: (name: string) => industries.addCategory(code ?? '', categoryKind, name),
    onSuccess: async () => {
      setCategoryName('');
      await refresh();
    },
    ...report,
  });
  const removeCategory = useMutation({ mutationFn: (id: string) => industries.removeCategory(id), onSuccess: refresh, ...report });
  const saveActivity = useMutation({
    mutationFn: (input: ActivityTypeInput) => (editingActivityId ? industries.updateActivityType(editingActivityId, input) : industries.addActivityType(code ?? '', input)),
    onSuccess: async () => {
      setEditingActivityId(null);
      activityForm.reset(NEW_ACTIVITY);
      await refresh();
      feedback.success('Activity saved.');
    },
    ...report,
  });
  const removeActivity = useMutation({ mutationFn: (id: string) => industries.removeActivityType(id), onSuccess: refresh, ...report });
  const setKpi = useMutation({
    mutationFn: ({ kpiCode, enabled: on, isHighlight }: { kpiCode: string; enabled: boolean; isHighlight: boolean }) => industries.setIndustryKpi(code ?? '', kpiCode, on, isHighlight),
    onSuccess: refresh,
    ...report,
  });

  const assignedKpis = assigned.data ?? [];

  return {
    isNew: !code,
    editing: !code || editingDetails,
    startEditing: () => setEditingDetails(true),
    cancelEditing() {
      if (industry.data) {
        const { code: industryCode, categoryCode: category, name, shortName, description, icon, chartTitle } = industry.data;
        reset({ code: industryCode, categoryCode: category, name, shortName, description, icon, chartTitle });
      }
      setEditingDetails(false);
    },
    loading: enabled && industry.isPending,
    error: industry.error ? errorMessage(industry.error) : null,
    isActive: industry.data?.isActive ?? true,
    form,
    // Inactive categories stay listed so that a type already in one still shows its name.
    categoryOptions: (businessCategories.data ?? []).map((item) => ({ value: item.code, label: item.isActive ? item.name : `${item.name} (inactive)` })),
    categoryLabel: businessCategories.data?.find((item) => item.code === form.values.categoryCode)?.name ?? form.values.categoryCode,
    busy: save.isPending || toggleActive.isPending,
    save() {
      const input = form.validate();
      if (input) save.mutate(input, { onSuccess: () => setEditingDetails(false) });
    },
    toggleActive: () => toggleActive.mutate(!(industry.data?.isActive ?? true)),

    categories: categories.data ?? [],
    categoryName,
    setCategoryName(value: string) {
      setCategoryName(value);
      setCategoryError(undefined);
    },
    categoryKind,
    setCategoryKind,
    categoryError,
    submitCategory() {
      const parsed = categoryNameSchema.safeParse(categoryName);
      if (parsed.success) addCategory.mutate(parsed.data);
      else setCategoryError(parsed.error.issues[0]?.message);
    },
    removeCategory: (id: string) => removeCategory.mutate(id),

    activities: activities.data ?? [],
    activityForm,
    editingActivity: editingActivityId !== null,
    editActivity(activity: ActivityTypeConfig) {
      setEditingActivityId(activity.id);
      activityForm.reset({
        code: activity.code,
        name: activity.name,
        description: activity.description,
        defaultUnit: activity.defaultUnit,
        usesFlock: activity.usesFlock ? 'yes' : 'no',
        allowsNegative: activity.allowsNegative ? 'yes' : 'no',
        minQuantity: activity.minQuantity === null ? '' : String(activity.minQuantity),
        maxQuantity: activity.maxQuantity === null ? '' : String(activity.maxQuantity),
        wholeNumbersOnly: activity.wholeNumbersOnly ? 'yes' : 'no',
        notesRequired: activity.notesRequired ? 'yes' : 'no',
        allowedUnits: activity.allowedUnits.join(', '),
      });
    },
    cancelActivityEdit() {
      setEditingActivityId(null);
      activityForm.reset(NEW_ACTIVITY);
    },
    submitActivity() {
      const input = activityForm.validate();
      if (input) saveActivity.mutate(input);
    },
    removeActivity: (id: string) => removeActivity.mutate(id),

    kpis: (kpis.data ?? []).map((kpi) => {
      const match = assignedKpis.find((item) => item.kpiCode === kpi.code);
      return { code: kpi.code, name: kpi.name, formula: kpi.formulaText, enabled: Boolean(match), isHighlight: match?.isHighlight ?? false };
    }),
    setKpiEnabled: (kpiCode: string, on: boolean) => setKpi.mutate({ kpiCode, enabled: on, isHighlight: false }),
    setKpiHighlight: (kpiCode: string, isHighlight: boolean) => setKpi.mutate({ kpiCode, enabled: true, isHighlight }),
  };
}

// FR-I06.
export function useKpiFormViewModel(onDone: () => void) {
  const { industries } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(kpiSchema, { code: '', name: '', explanation: '', formulaText: '', requiredData: '', unitKind: 'quantity', formula: 'activity_total', activityCode: '' });

  const save = useMutation({
    mutationFn: (input: KpiDefinition) => industries.createKpiDefinition(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('KPI created. Turn it on for an industry to use it.');
      onDone();
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    form,
    saving: save.isPending,
    submit() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
  };
}
