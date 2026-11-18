import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { useFeedback } from '@/design-system';

import type { ActivityFieldConfig, ActivityFieldInput, ActivityGroupConfig } from '../../domain/models';
import { activityFieldSchema, activityGroupSchema } from '../../domain/validation';
import { useAdministrationDependencies } from '../di';

// Shares the industries scope so a change here refreshes the business type screens too.
const scope = ['admin', 'industries'];
const groupsKey = [...scope, 'activity-groups'];

// Activity Catalogue: the groups activity types belong to.
export function useActivityGroupsViewModel() {
  const { industries } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: groupsKey, queryFn: () => industries.listActivityGroups() });
  const form = useForm(activityGroupSchema, { code: '', name: '', description: '', sortOrder: '100' });
  const { reset } = form;
  const [editing, setEditing] = useState<ActivityGroupConfig | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: scope });
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };
  const save = useMutation({
    mutationFn: async (input: { code: string; name: string; description: string; sortOrder: number }) => {
      if (editing) await industries.updateActivityGroup(editing.code, { ...input, isActive: editing.isActive });
      else await industries.createActivityGroup({ ...input, isActive: true });
    },
    onSuccess: async () => {
      setEditing(null);
      reset({ code: '', name: '', description: '', sortOrder: '100' });
      await refresh();
      feedback.success('Group saved.');
    },
    ...report,
  });
  const toggle = useMutation({
    mutationFn: (group: ActivityGroupConfig) => industries.updateActivityGroup(group.code, { ...group, isActive: !group.isActive }),
    onSuccess: async (_result, group) => {
      await refresh();
      feedback.success(group.isActive ? 'Group deactivated. Its activities are hidden from new records.' : 'Group reactivated.');
    },
    ...report,
  });

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    groups: list.data ?? [],
    form,
    editing: editing !== null,
    busy: save.isPending || toggle.isPending,
    edit(group: ActivityGroupConfig) {
      setEditing(group);
      reset({ code: group.code, name: group.name, description: group.description, sortOrder: String(group.sortOrder) });
    },
    cancelEdit() {
      setEditing(null);
      reset({ code: '', name: '', description: '', sortOrder: '100' });
    },
    save() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
    toggle: (group: ActivityGroupConfig) => toggle.mutate(group),
  };
}

const NEW_FIELD = { code: '', label: '', help: '', dataType: 'text', isRequired: 'no', unit: '', options: '', minValue: '', maxValue: '', sortOrder: '10', isActive: 'yes' };

const toFieldValues = (field: ActivityFieldConfig) => ({
  code: field.code,
  label: field.label,
  help: field.help,
  dataType: field.dataType,
  isRequired: field.isRequired ? 'yes' : 'no',
  unit: field.unit ?? '',
  options: field.options.join(', '),
  minValue: field.minValue === null ? '' : String(field.minValue),
  maxValue: field.maxValue === null ? '' : String(field.maxValue),
  sortOrder: String(field.sortOrder),
  isActive: field.isActive ? 'yes' : 'no',
});

// Activity Catalogue section 4: the questions on one activity type's form.
export function useActivityFieldsViewModel(activityTypeId: string) {
  const { industries } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const key = [...scope, 'activity-fields', activityTypeId];
  const type = useQuery({ queryKey: [...key, 'type'], queryFn: () => industries.getActivityType(activityTypeId) });
  const fields = useQuery({ queryKey: key, queryFn: () => industries.listActivityFields(activityTypeId) });
  const form = useForm(activityFieldSchema, NEW_FIELD);
  const { reset } = form;
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (editingId === null) reset({ ...NEW_FIELD, sortOrder: String(((fields.data ?? []).length + 1) * 10) });
  }, [editingId, fields.data, reset]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: scope });
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };
  const save = useMutation({
    mutationFn: (input: ActivityFieldInput) => (editingId ? industries.updateActivityField(editingId, input) : industries.addActivityField(activityTypeId, input)),
    onSuccess: async () => {
      setEditingId(null);
      await refresh();
      feedback.success('Field saved. The form has a new version.');
    },
    ...report,
  });
  const remove = useMutation({
    mutationFn: (id: string) => industries.removeActivityField(id),
    onSuccess: async () => {
      await refresh();
      feedback.success('Field removed.');
    },
    ...report,
  });

  return {
    loading: type.isPending || fields.isPending,
    error: type.error ? errorMessage(type.error) : fields.error ? errorMessage(fields.error) : null,
    typeName: type.data?.name ?? '',
    formVersion: type.data?.formVersion ?? 1,
    fields: fields.data ?? [],
    form,
    editing: editingId !== null,
    busy: save.isPending || remove.isPending,
    edit(field: ActivityFieldConfig) {
      setEditingId(field.id);
      reset(toFieldValues(field));
    },
    cancelEdit: () => setEditingId(null),
    save() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
    // The database refuses a field that records already use, and says to deactivate it.
    remove: (id: string) => remove.mutate(id),
  };
}
