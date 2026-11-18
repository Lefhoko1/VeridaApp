import { StyleSheet, View } from 'react-native';
import { List, Switch, Text } from 'react-native-paper';

import { formatQuantity } from '@/core/format/format';
import { DateField, EmptyState, ErrorView, FormField, LoadingView, MultiSelectField, Notice, Panel, Screen, SectionHeader, SelectField, spacing, supporting } from '@/design-system';

import type { ActivityField, ActivityRecord, ActivityStatus } from '../../domain/models';
import { useActivitySettingsViewModel } from '../viewmodels/useActivityViewModels';

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

// The quantity of an activity, or nothing for one that records no quantity.
export const activityAmount = (record: Pick<ActivityRecord, 'quantity' | 'unit'>) =>
  record.quantity === null ? '' : `${formatQuantity(record.quantity)} ${record.unit ?? ''}`.trim();

export const STATUS_TONES: Record<ActivityStatus, 'ok' | 'warn' | 'neutral' | 'danger'> = {
  planned: 'neutral',
  in_progress: 'warn',
  recorded: 'ok',
  requires_review: 'warn',
  cancelled: 'neutral',
  voided: 'danger',
};

type FieldProps = {
  field: ActivityField;
  value: string | string[] | undefined;
  error?: string;
  disabled?: boolean;
  onChange: (value: string | string[]) => void;
};

// One question on an activity's form, drawn from its configuration (Activity Catalogue section 4).
export function ActivityFieldInput({ field, value, error, disabled, onChange }: FieldProps) {
  const label = field.isRequired ? field.label : `${field.label} (optional)`;
  const hint = [field.help, field.unit ? `In ${field.unit}.` : ''].filter(Boolean).join(' ') || undefined;
  const text = Array.isArray(value) ? '' : (value ?? '');
  const options = field.options.map((option) => ({ value: option, label: option }));

  switch (field.dataType) {
    case 'boolean':
      return <SelectField label={label} value={text} options={YES_NO} onChange={onChange} error={error} hint={hint} disabled={disabled} />;
    case 'select':
      return <SelectField label={label} value={text} options={options} onChange={onChange} error={error} hint={hint} disabled={disabled} />;
    case 'multi_select':
      return (
        <MultiSelectField label={label} values={Array.isArray(value) ? value : []} options={options} onChange={onChange} error={error} hint={hint} disabled={disabled} allowOther={false} allLabel="" />
      );
    case 'date':
      return <DateField label={label} value={text} onChangeText={onChange} error={error} disabled={disabled} />;
    case 'integer':
    case 'decimal':
      return <FormField label={label} value={text} onChangeText={onChange} error={error} hint={hint} keyboardType="numbers-and-punctuation" disabled={disabled} />;
    case 'time':
      return <FormField label={label} value={text} onChangeText={onChange} error={error} hint={hint ?? 'For example 14:30.'} keyboardType="numbers-and-punctuation" disabled={disabled} />;
    default:
      return <FormField label={label} value={text} onChangeText={onChange} error={error} hint={hint} disabled={disabled} />;
  }
}

// Activity Catalogue section 7: the owner chooses what the business records.
export function ActivitySettingsScreen() {
  const vm = useActivitySettingsViewModel();
  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;

  return (
    <Screen>
      <SectionHeader
        title="Activities you record"
        description={`${vm.enabledCount} switched on. Switching one off hides it from new records; records already made keep it.`}
      />
      {!vm.canChange ? <Notice tone="info">Only someone who can manage the business can change these.</Notice> : null}
      {vm.groups.length === 0 ? <EmptyState title="No activities are set up for your type of business yet." /> : null}
      {vm.groups.map((group) => (
        <Panel key={group.code} style={styles.list}>
          <Text variant="titleSmall" style={styles.group}>
            {group.name}
          </Text>
          {group.types.map((type) => (
            <List.Item
              key={type.id}
              title={type.name}
              description={type.description || undefined}
              descriptionNumberOfLines={2}
              right={() => (
                <View style={styles.toggle}>
                  <Switch value={type.isEnabled} disabled={!vm.canChange || vm.busy} onValueChange={(on) => vm.setEnabled(type.id, on)} accessibilityLabel={`Record ${type.name}`} />
                </View>
              )}
            />
          ))}
        </Panel>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.xs, gap: 0 },
  group: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, color: supporting.mutedText },
  toggle: { justifyContent: 'center' },
});
