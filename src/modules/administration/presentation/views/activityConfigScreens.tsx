import { StyleSheet, View } from 'react-native';
import { Divider, IconButton, Text } from 'react-native-paper';

import { Button, EmptyState, ErrorView, FieldGrid, FormField, LoadingView, Panel, Row, Screen, SectionHeader, SelectField, StatusPill, spacing, supporting } from '@/design-system';

import { FIELD_TYPE_OPTIONS, YES_NO_OPTIONS } from '../../domain/validation';
import { useActivityFieldsViewModel, useActivityGroupsViewModel } from '../viewmodels/useActivityConfigViewModels';

const typeLabel = (value: string) => FIELD_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;

// Activity Catalogue: the groups every activity type belongs to.
export function ActivityGroupsScreen() {
  const vm = useActivityGroupsViewModel();
  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen>
      <SectionHeader title="Activity groups" description="Every activity type belongs to one. Deactivating a group hides its activities from new records." />
      <Panel style={styles.list}>
        {vm.groups.map((group, index) => (
          <View key={group.code}>
            {index > 0 ? <Divider /> : null}
            <Row>
              <View style={styles.grow}>
                <Text variant="bodyMedium">{group.name}</Text>
                <Text style={styles.muted}>{group.description}</Text>
              </View>
              {group.isActive ? <StatusPill label="Active" tone="ok" /> : <StatusPill label="Inactive" tone="neutral" />}
              <IconButton icon="pencil-outline" size={18} onPress={() => vm.edit(group)} accessibilityLabel={`Edit ${group.name}`} />
              <IconButton icon={group.isActive ? 'eye-off-outline' : 'eye-outline'} size={18} disabled={vm.busy} onPress={() => vm.toggle(group)} accessibilityLabel={group.isActive ? `Deactivate ${group.name}` : `Reactivate ${group.name}`} />
            </Row>
          </View>
        ))}
      </Panel>
      <Panel>
        <SectionHeader title={vm.editing ? 'Edit group' : 'New group'} />
        <FormField label="Code" value={values.code} onChangeText={(v) => setValue('code', v)} error={errors.code} autoCapitalize="none" disabled={vm.editing} />
        <FormField label="Name" value={values.name} onChangeText={(v) => setValue('name', v)} error={errors.name} />
        <FormField label="Description (optional)" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} />
        <FormField label="Position in the list" value={values.sortOrder} onChangeText={(v) => setValue('sortOrder', v)} error={errors.sortOrder} keyboardType="number-pad" />
        <Row>
          <Button mode="contained" onPress={vm.save} loading={vm.busy} disabled={vm.busy}>
            {vm.editing ? 'Save group' : 'Add group'}
          </Button>
          {vm.editing ? <Button onPress={vm.cancelEdit}>Cancel</Button> : null}
        </Row>
      </Panel>
    </Screen>
  );
}

// Activity Catalogue section 4: the questions on one activity type's form.
export function ActivityFieldsScreen({ activityTypeId }: { activityTypeId: string }) {
  const vm = useActivityFieldsViewModel(activityTypeId);
  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} />;
  const { values, errors, setValue } = vm.form;
  const hasChoices = values.dataType === 'select' || values.dataType === 'multi_select';
  const isNumber = values.dataType === 'integer' || values.dataType === 'decimal';

  return (
    <Screen>
      <SectionHeader
        title={`${vm.typeName}: form fields`}
        description={`Version ${vm.formVersion}. Every change makes a new version, and each record keeps the version it was made with.`}
      />
      <Panel style={styles.list}>
        {vm.fields.length === 0 ? <EmptyState title="No extra fields. The form asks for the date, status, quantity and notes." /> : null}
        {vm.fields.map((field, index) => (
          <View key={field.id}>
            {index > 0 ? <Divider /> : null}
            <Row>
              <View style={styles.grow}>
                <Text variant="bodyMedium">{field.label}</Text>
                <Text style={styles.muted}>
                  {typeLabel(field.dataType)}
                  {field.isRequired ? ' · required when completed' : ' · optional'}
                  {field.unit ? ` · ${field.unit}` : ''}
                  {field.options.length > 0 ? ` · ${field.options.join(', ')}` : ''}
                </Text>
              </View>
              {field.isActive ? null : <StatusPill label="Inactive" tone="neutral" />}
              <IconButton icon="pencil-outline" size={18} onPress={() => vm.edit(field)} accessibilityLabel={`Edit ${field.label}`} />
              <IconButton icon="close" size={18} disabled={vm.busy} onPress={() => vm.remove(field.id)} accessibilityLabel={`Remove ${field.label}`} />
            </Row>
          </View>
        ))}
      </Panel>
      <Panel>
        <SectionHeader title={vm.editing ? 'Edit field' : 'New field'} />
        <FieldGrid>
          <FormField label="Question" value={values.label} onChangeText={(v) => setValue('label', v)} error={errors.label} />
          <FormField label="Field code" value={values.code} onChangeText={(v) => setValue('code', v)} error={errors.code} autoCapitalize="none" disabled={vm.editing} hint="Stored with each answer, so it cannot change later." />
          <SelectField label="Kind of answer" value={values.dataType} options={FIELD_TYPE_OPTIONS} onChange={(v) => setValue('dataType', v)} error={errors.dataType} />
          <SelectField label="Required when completed" value={values.isRequired} options={YES_NO_OPTIONS} onChange={(v) => setValue('isRequired', v)} />
        </FieldGrid>
        <FormField label="Help text (optional)" value={values.help} onChangeText={(v) => setValue('help', v)} error={errors.help} />
        {hasChoices ? <FormField label="Choices, separated by commas" value={values.options} onChangeText={(v) => setValue('options', v)} error={errors.options} /> : null}
        {isNumber ? (
          <FieldGrid>
            <FormField label="Unit (optional)" value={values.unit} onChangeText={(v) => setValue('unit', v)} error={errors.unit} />
            <FormField label="Smallest value (optional)" value={values.minValue} onChangeText={(v) => setValue('minValue', v)} error={errors.minValue} keyboardType="numbers-and-punctuation" />
            <FormField label="Largest value (optional)" value={values.maxValue} onChangeText={(v) => setValue('maxValue', v)} error={errors.maxValue} keyboardType="numbers-and-punctuation" />
          </FieldGrid>
        ) : null}
        <FieldGrid>
          <FormField label="Position on the form" value={values.sortOrder} onChangeText={(v) => setValue('sortOrder', v)} error={errors.sortOrder} keyboardType="number-pad" />
          <SelectField label="Shown on the form" value={values.isActive} options={YES_NO_OPTIONS} onChange={(v) => setValue('isActive', v)} />
        </FieldGrid>
        <Row>
          <Button mode="contained" onPress={vm.save} loading={vm.busy} disabled={vm.busy}>
            {vm.editing ? 'Save field' : 'Add field'}
          </Button>
          {vm.editing ? <Button onPress={vm.cancelEdit}>Cancel</Button> : null}
        </Row>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.xs, gap: 0 },
  grow: { flex: 1, minWidth: 0 },
  muted: { fontSize: 11, color: supporting.mutedText },
});
