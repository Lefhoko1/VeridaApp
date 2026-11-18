import { StyleSheet, View } from 'react-native';
import { Divider, IconButton, List, Switch, Text } from 'react-native-paper';

import { LabelValue, Button, EmptyState, ErrorView, FormField, LoadingView, Notice, Panel, Row, Screen, SectionHeader, SelectField, StatusPill, spacing, supporting } from '@/design-system';

import { KPI_FORMULA_OPTIONS, KPI_UNIT_OPTIONS, YES_NO_OPTIONS } from '../../domain/validation';
import { useBusinessCategoryViewModel, useIndustryDetailViewModel, useIndustryListViewModel, useKpiFormViewModel } from '../viewmodels/useIndustryViewModels';

const KIND_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'sale', label: 'Sale' },
];

const activePill = (isActive: boolean) => (isActive ? <StatusPill label="Active" tone="ok" /> : <StatusPill label="Inactive" tone="neutral" />);

type IndustryListProps = {
  onCreate: (categoryCode?: string) => void;
  onOpen: (code: string) => void;
  onCreateKpi: () => void;
  onCreateCategory: () => void;
  onOpenCategory: (code: string) => void;
};

// The business taxonomy: main categories, each with the business types (subcategories) in it.
export function IndustryListScreen({ onCreate, onOpen, onCreateKpi, onCreateCategory, onOpenCategory }: IndustryListProps) {
  const vm = useIndustryListViewModel();

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;

  return (
    <Screen>
      <SectionHeader title="Business categories and types" description="What businesses choose at setup. Forms, categories and dashboards follow each type's settings." />
      <Row wrap>
        <Button mode="contained" icon="plus" onPress={onCreateCategory}>
          Add category
        </Button>
        <Button mode="outlined" icon="plus" onPress={() => onCreate()}>
          Add business type
        </Button>
        <Button mode="outlined" icon="plus" onPress={onCreateKpi}>
          Add KPI
        </Button>
      </Row>
      {vm.groups.map(({ category, items }) => (
        <Panel key={category?.code ?? 'uncategorised'} style={styles.list}>
          <List.Item
            title={category?.name ?? 'Without a category'}
            titleStyle={styles.groupTitle}
            description={category ? `${items.length} ${items.length === 1 ? 'type' : 'types'}` : 'Open each type to choose its category.'}
            left={category ? (props) => <List.Icon {...props} icon={category.icon} /> : undefined}
            onPress={category ? () => onOpenCategory(category.code) : undefined}
            right={category ? () => activePill(category.isActive) : undefined}
          />
          {items.map((industry) => (
            <View key={industry.code}>
              <Divider />
              <List.Item title={industry.name} description={industry.description} onPress={() => onOpen(industry.code)} right={() => activePill(industry.isActive)} style={styles.indented} />
            </View>
          ))}
          {category ? (
            <Button compact icon="plus" onPress={() => onCreate(category.code)}>
              Add a type to {category.name}
            </Button>
          ) : null}
        </Panel>
      ))}
    </Screen>
  );
}

export function BusinessCategoryScreen({ code, onCreated, onOpenType }: { code?: string; onCreated: (code: string) => void; onOpenType: (code: string) => void }) {
  const vm = useBusinessCategoryViewModel({ code, onCreated });

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen variant="form">
      <Panel>
        <SectionHeader
          title={vm.isNew ? 'New category' : 'Category'}
          action={
            vm.editing ? undefined : (
              <Button compact icon="pencil-outline" onPress={vm.startEditing}>
                Edit
              </Button>
            )
          }
        />
        {vm.editing ? (
          <>
            <FormField label="Code" value={values.code} onChangeText={(v) => setValue('code', v)} error={errors.code} disabled={!vm.isNew} autoCapitalize="none" hint={vm.isNew ? 'Cannot be changed later.' : undefined} />
            <FormField label="Name" value={values.name} onChangeText={(v) => setValue('name', v)} error={errors.name} />
            <FormField label="Description (optional)" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} />
            <FormField label="Icon name" value={values.icon} onChangeText={(v) => setValue('icon', v)} error={errors.icon} autoCapitalize="none" hint="A Material Community Icons name, such as sprout-outline." />
            <FormField label="Position in the list" value={values.sortOrder} onChangeText={(v) => setValue('sortOrder', v)} error={errors.sortOrder} keyboardType="number-pad" />
            <Button mode="contained" onPress={vm.save} loading={vm.busy} disabled={vm.busy}>
              {vm.isNew ? 'Create category' : 'Save category'}
            </Button>
            {!vm.isNew ? (
              <Button onPress={vm.cancelEditing} disabled={vm.busy}>
                Cancel
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <LabelValue label="Code" value={values.code} />
            <LabelValue label="Name" value={values.name} />
            <LabelValue label="Description" value={values.description || 'None'} />
            <LabelValue label="Icon name" value={values.icon} />
            <LabelValue label="Position in the list" value={values.sortOrder} />
          </>
        )}
        {!vm.isNew ? (
          <Button onPress={vm.toggleActive} disabled={vm.busy} textColor={vm.isActive ? supporting.error : undefined}>
            {vm.isActive ? 'Deactivate category' : 'Reactivate category'}
          </Button>
        ) : null}
      </Panel>
      {!vm.isNew ? (
        <>
          {!vm.isActive ? <Notice tone="info">Businesses that already use these types keep them. New businesses cannot choose them.</Notice> : null}
          <Panel style={styles.list}>
            <SectionHeader title="Business types" />
            {vm.types.length === 0 ? <EmptyState title="No types in this category yet." /> : null}
            {vm.types.map((industry, index) => (
              <View key={industry.code}>
                {index > 0 ? <Divider /> : null}
                <List.Item title={industry.name} description={industry.description} onPress={() => onOpenType(industry.code)} right={() => activePill(industry.isActive)} />
              </View>
            ))}
          </Panel>
        </>
      ) : null}
    </Screen>
  );
}

export function IndustryDetailScreen({ code, categoryCode, onCreated }: { code?: string; categoryCode?: string; onCreated: (code: string) => void }) {
  const vm = useIndustryDetailViewModel({ code, categoryCode, onCreated });

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} />;
  const { values, errors, setValue } = vm.form;
  const activity = vm.activityForm;

  return (
    <Screen>
      <Panel>
        <SectionHeader
          title="Details"
          action={
            vm.editing ? undefined : (
              <Button compact icon="pencil-outline" onPress={vm.startEditing}>
                Edit
              </Button>
            )
          }
        />
        {vm.editing ? (
          <>
        <FormField label="Code" value={values.code} onChangeText={(v) => setValue('code', v)} error={errors.code} disabled={!vm.isNew} autoCapitalize="none" hint={vm.isNew ? 'Cannot be changed later.' : undefined} />
        <SelectField label="Category" value={values.categoryCode} options={vm.categoryOptions} onChange={(v) => setValue('categoryCode', v)} error={errors.categoryCode} />
        <FormField label="Name" value={values.name} onChangeText={(v) => setValue('name', v)} error={errors.name} />
        <FormField label="Short name" value={values.shortName} onChangeText={(v) => setValue('shortName', v)} error={errors.shortName} />
        <FormField label="Description" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} />
        <FormField label="Chart title" value={values.chartTitle} onChangeText={(v) => setValue('chartTitle', v)} error={errors.chartTitle} />
        <FormField label="Icon name" value={values.icon} onChangeText={(v) => setValue('icon', v)} error={errors.icon} autoCapitalize="none" />
        <Button mode="contained" onPress={vm.save} loading={vm.busy} disabled={vm.busy}>
          {vm.isNew ? 'Create industry' : 'Save details'}
        </Button>
        {!vm.isNew ? (
          <Button onPress={vm.cancelEditing} disabled={vm.busy}>
            Cancel
          </Button>
        ) : null}
          </>
        ) : (
          <>
            <LabelValue label="Code" value={values.code} />
            <LabelValue label="Category" value={vm.categoryLabel} />
            <LabelValue label="Name" value={values.name} />
            <LabelValue label="Short name" value={values.shortName} />
            <LabelValue label="Description" value={values.description} />
            <LabelValue label="Chart title" value={values.chartTitle} />
            <LabelValue label="Icon name" value={values.icon} />
          </>
        )}
        {!vm.isNew ? (
          <Button onPress={vm.toggleActive} disabled={vm.busy} textColor={vm.isActive ? supporting.error : undefined}>
            {vm.isActive ? 'Deactivate industry' : 'Reactivate industry'}
          </Button>
        ) : null}
      </Panel>

      {vm.isNew ? (
        <Notice>Create the industry first, then add its categories, activities and KPIs.</Notice>
      ) : (
        <>
          <Panel>
            <SectionHeader title="Record categories" />
            {vm.categories.length === 0 ? <EmptyState title="No categories yet." /> : null}
            {vm.categories.map((category) => (
              <Row key={category.id}>
                <View style={styles.grow}>
                  <Text variant="bodyMedium">{category.name}</Text>
                  <Text style={styles.muted}>Reported under {vm.groupName(category.financeCategoryCode)}</Text>
                </View>
                <View style={styles.grow}>
                  <SelectField label="Group" value={category.financeCategoryCode ?? ''} options={vm.groupOptions(category.kind)} onChange={(value) => vm.changeCategoryGroup(category.id, value)} />
                </View>
                <StatusPill label={category.kind} />
                <IconButton icon="close" size={18} onPress={() => vm.removeCategory(category.id)} accessibilityLabel={`Remove ${category.name}`} />
              </Row>
            ))}
            <Row gap={spacing.sm}>
              <View style={styles.grow}>
                <FormField label="New category" value={vm.categoryName} onChangeText={vm.setCategoryName} error={vm.categoryError} />
              </View>
              <View style={styles.grow}>
                <SelectField label="Type" value={vm.categoryKind} options={KIND_OPTIONS} onChange={(value) => vm.setCategoryKind(value as 'sale' | 'expense')} />
              </View>
            </Row>
            <SelectField label="Reported under" value={vm.categoryGroup} options={vm.groupOptions(vm.categoryKind)} onChange={vm.setCategoryGroup} hint="The universal category this one belongs to." />
            <Button mode="outlined" onPress={vm.submitCategory}>
              Add category
            </Button>
          </Panel>

          <Panel>
            <SectionHeader title="Activities" description="What this industry records, with its units and validation rules." />
            {vm.activities.map((item) => (
              <Row key={item.id}>
                <View style={styles.grow}>
                  <Text variant="bodyMedium">{item.name}</Text>
                  <Text style={styles.muted}>
                    {item.defaultUnit}
                    {item.allowedUnits.length > 1 ? ` (or ${item.allowedUnits.filter((unit) => unit !== item.defaultUnit).join(', ')})` : ''}
                    {item.minQuantity !== null ? ` · at least ${item.minQuantity}` : ''}
                    {item.maxQuantity !== null ? ` · at most ${item.maxQuantity}` : ''}
                    {item.wholeNumbersOnly ? ' · whole numbers' : ''}
                    {item.notesRequired ? ' · needs a note' : ''}
                    {item.allowsNegative ? ' · may be negative' : ''}
                    {item.usesFlock ? ' · per flock' : ''}
                  </Text>
                </View>
                <IconButton icon="pencil-outline" size={18} onPress={() => vm.editActivity(item)} accessibilityLabel={`Edit ${item.name}`} />
                <IconButton icon="close" size={18} onPress={() => vm.removeActivity(item.id)} accessibilityLabel={`Remove ${item.name}`} />
              </Row>
            ))}
            <Divider />
            <SectionHeader title={vm.editingActivity ? 'Edit activity' : 'New activity'} />
            <FormField label="Activity code" value={activity.values.code} onChangeText={(v) => activity.setValue('code', v)} error={activity.errors.code} autoCapitalize="none" disabled={vm.editingActivity} />
            <FormField label="Activity name" value={activity.values.name} onChangeText={(v) => activity.setValue('name', v)} error={activity.errors.name} />
            <FormField label="What to record" value={activity.values.description} onChangeText={(v) => activity.setValue('description', v)} error={activity.errors.description} />
            <FormField label="Default unit" value={activity.values.defaultUnit} onChangeText={(v) => activity.setValue('defaultUnit', v)} error={activity.errors.defaultUnit} />
            <FormField label="Allowed units, separated by commas (optional)" value={activity.values.allowedUnits} onChangeText={(v) => activity.setValue('allowedUnits', v)} error={activity.errors.allowedUnits} />
            <FormField label="Minimum quantity (optional)" value={activity.values.minQuantity} onChangeText={(v) => activity.setValue('minQuantity', v)} error={activity.errors.minQuantity} keyboardType="numbers-and-punctuation" />
            <FormField label="Maximum quantity (optional)" value={activity.values.maxQuantity} onChangeText={(v) => activity.setValue('maxQuantity', v)} error={activity.errors.maxQuantity} keyboardType="decimal-pad" />
            <Row gap={spacing.sm}>
              <View style={styles.grow}>
                <SelectField label="May be negative" value={activity.values.allowsNegative} options={YES_NO_OPTIONS} onChange={(v) => activity.setValue('allowsNegative', v)} />
              </View>
              <View style={styles.grow}>
                <SelectField label="Tracked per flock" value={activity.values.usesFlock} options={YES_NO_OPTIONS} onChange={(v) => activity.setValue('usesFlock', v)} />
              </View>
            </Row>
            <Row gap={spacing.sm}>
              <View style={styles.grow}>
                <SelectField label="Whole numbers only" value={activity.values.wholeNumbersOnly} options={YES_NO_OPTIONS} onChange={(v) => activity.setValue('wholeNumbersOnly', v)} />
              </View>
              <View style={styles.grow}>
                <SelectField label="Note required" value={activity.values.notesRequired} options={YES_NO_OPTIONS} onChange={(v) => activity.setValue('notesRequired', v)} />
              </View>
            </Row>
            <Row>
              <Button mode="outlined" onPress={vm.submitActivity}>
                {vm.editingActivity ? 'Save activity' : 'Add activity'}
              </Button>
              {vm.editingActivity ? <Button onPress={vm.cancelActivityEdit}>Cancel</Button> : null}
            </Row>
          </Panel>

          <Panel>
            <SectionHeader title="KPIs" description="Turn on what this industry should see. Highlighted KPIs appear at the top of the dashboard." />
            {vm.kpis.map((kpi) => (
              <Row key={kpi.code}>
                <View style={styles.grow}>
                  <Text variant="bodyMedium">{kpi.name}</Text>
                  <Text style={styles.muted}>{kpi.formula}</Text>
                </View>
                <View style={styles.toggle}>
                  <Text style={styles.muted}>Top</Text>
                  <Switch value={kpi.isHighlight} disabled={!kpi.enabled} onValueChange={(on) => vm.setKpiHighlight(kpi.code, on)} accessibilityLabel={`Highlight ${kpi.name}`} />
                </View>
                <View style={styles.toggle}>
                  <Text style={styles.muted}>On</Text>
                  <Switch value={kpi.enabled} onValueChange={(on) => vm.setKpiEnabled(kpi.code, on)} accessibilityLabel={`Use ${kpi.name}`} />
                </View>
              </Row>
            ))}
          </Panel>
        </>
      )}
    </Screen>
  );
}

export function KpiFormScreen({ onDone }: { onDone: () => void }) {
  const vm = useKpiFormViewModel(onDone);
  const { values, errors, setValue } = vm.form;

  return (
    <Screen variant="form">
      <Panel>
        <SectionHeader title="New KPI" description="Built from an activity's records. Other calculations need a new formula in the analytics service." />
        <FormField label="Code" value={values.code} onChangeText={(v) => setValue('code', v)} error={errors.code} autoCapitalize="none" />
        <FormField label="Name" value={values.name} onChangeText={(v) => setValue('name', v)} error={errors.name} />
        <SelectField label="Calculation" value={values.formula} options={KPI_FORMULA_OPTIONS} onChange={(v) => setValue('formula', v)} error={errors.formula} />
        <FormField label="Activity code" value={values.activityCode} onChangeText={(v) => setValue('activityCode', v)} error={errors.activityCode} autoCapitalize="none" hint="The code of the activity to measure, such as eggs_collected." />
        <SelectField label="Unit" value={values.unitKind} options={KPI_UNIT_OPTIONS} onChange={(v) => setValue('unitKind', v)} error={errors.unitKind} />
        <FormField label="Explanation for owners" value={values.explanation} onChangeText={(v) => setValue('explanation', v)} error={errors.explanation} multiline />
        <FormField label="How it is calculated" value={values.formulaText} onChangeText={(v) => setValue('formulaText', v)} error={errors.formulaText} />
        <FormField label="What it needs" value={values.requiredData} onChangeText={(v) => setValue('requiredData', v)} error={errors.requiredData} />
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          Create KPI
        </Button>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.xs, gap: 0 },
  groupTitle: { fontWeight: '600' },
  indented: { paddingLeft: spacing.md },
  grow: { flex: 1, minWidth: 0 },
  muted: { fontSize: 11, color: supporting.mutedText },
  toggle: { alignItems: 'center' },
});
