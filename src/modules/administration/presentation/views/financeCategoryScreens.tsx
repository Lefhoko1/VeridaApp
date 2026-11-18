import { StyleSheet, View } from 'react-native';
import { Divider, List, Text } from 'react-native-paper';

import { Button, EmptyState, ErrorView, FormField, LabelValue, LoadingView, Notice, Panel, Row, Screen, SectionHeader, SelectField, StatusPill, spacing, supporting } from '@/design-system';

import type { FinanceCategoryConfig } from '../../domain/models';
import { type FinanceKind, useFinanceCategoryListViewModel, useFinanceCategoryViewModel } from '../viewmodels/useFinanceCategoryViewModels';

const KIND_OPTIONS = [
  { value: 'sale', label: 'Sales' },
  { value: 'expense', label: 'Expenses' },
];

const activePill = (isActive: boolean) => (isActive ? <StatusPill label="Active" tone="ok" /> : <StatusPill label="Inactive" tone="neutral" />);

type ListProps = {
  onOpen: (code: string) => void;
  onCreate: (kind: FinanceKind, parentCode?: string) => void;
};

// Business Taxonomy sections 3 and 4: the categories every business's sales and expenses are reported under.
export function FinanceCategoryListScreen({ onOpen, onCreate }: ListProps) {
  const vm = useFinanceCategoryListViewModel();

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;

  const section = (title: string, kind: FinanceKind, groups: typeof vm.sales) => (
    <>
      <SectionHeader
        title={title}
        action={
          <Button compact icon="plus" onPress={() => onCreate(kind)}>
            Add category
          </Button>
        }
      />
      {groups.map(({ category, subcategories }) => (
        <Panel key={category.code} style={styles.list}>
          <List.Item title={category.name} titleStyle={styles.groupTitle} description={category.description || undefined} descriptionNumberOfLines={2} onPress={() => onOpen(category.code)} right={() => activePill(category.isActive)} />
          {subcategories.map((item) => (
            <View key={item.code}>
              <Divider />
              <List.Item title={item.name} onPress={() => onOpen(item.code)} right={() => activePill(item.isActive)} style={styles.indented} />
            </View>
          ))}
          {kind === 'expense' ? (
            <Button compact icon="plus" onPress={() => onCreate(kind, category.code)}>
              Add a subcategory
            </Button>
          ) : null}
        </Panel>
      ))}
    </>
  );

  return (
    <Screen>
      <SectionHeader title="Sales and expense categories" description="Shared by every business. Each business type's own categories are reported under one of these." />
      {section('Sales', 'sale', vm.sales)}
      {section('Expenses', 'expense', vm.expenses)}
    </Screen>
  );
}

type DetailProps = {
  code?: string;
  kind?: FinanceKind;
  parentCode?: string;
  onCreated: (code: string) => void;
  onOpen: (code: string) => void;
};

export function FinanceCategoryScreen({ code, kind, parentCode, onCreated, onOpen }: DetailProps) {
  const vm = useFinanceCategoryViewModel({ code, kind, parentCode, onCreated });

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} />;
  const { values, errors, setValue } = vm.form;
  const kindLabel = values.kind === 'sale' ? 'Sales' : 'Expenses';

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
            {vm.isNew ? <SelectField label="Used for" value={values.kind} options={KIND_OPTIONS} onChange={vm.setKind} error={errors.kind} /> : <LabelValue label="Used for" value={kindLabel} />}
            {vm.canHaveParent ? (
              <SelectField label="Belongs to" value={values.parentCode} options={vm.parentOptions} onChange={(v) => setValue('parentCode', v)} error={errors.parentCode} />
            ) : (
              <LabelValue label="Belongs to" value="None: this category has subcategories" />
            )}
            <FormField label="Name" value={values.name} onChangeText={(v) => setValue('name', v)} error={errors.name} />
            <FormField label="Examples or guidance (optional)" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} multiline />
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
            <LabelValue label="Used for" value={kindLabel} />
            <LabelValue label="Belongs to" value={vm.parentName} />
            <LabelValue label="Name" value={values.name} />
            <LabelValue label="Examples or guidance" value={values.description || 'None'} />
            <LabelValue label="Position in the list" value={values.sortOrder} />
          </>
        )}
        {!vm.isNew ? (
          <Button onPress={vm.toggleActive} disabled={vm.busy} textColor={vm.isActive ? supporting.error : undefined}>
            {vm.isActive ? 'Deactivate category' : 'Reactivate category'}
          </Button>
        ) : null}
      </Panel>
      {!vm.isNew && !vm.isActive ? <Notice tone="info">Businesses can no longer choose it. Records that already use it keep it.</Notice> : null}
      {!vm.isNew && values.parentCode === '' ? <SubcategoryList items={vm.subcategories} onOpen={onOpen} /> : null}
    </Screen>
  );
}

function SubcategoryList({ items, onOpen }: { items: FinanceCategoryConfig[]; onOpen: (code: string) => void }) {
  return (
    <Panel style={styles.list}>
      <SectionHeader title="Subcategories" />
      {items.length === 0 ? <EmptyState title="No subcategories." /> : null}
      {items.map((item, index) => (
        <View key={item.code}>
          {index > 0 ? <Divider /> : null}
          <Row>
            <View style={styles.grow}>
              <List.Item title={item.name} onPress={() => onOpen(item.code)} right={() => activePill(item.isActive)} />
            </View>
          </Row>
        </View>
      ))}
      <Text style={styles.muted}>Records are reported under this category whichever subcategory they use.</Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.xs, gap: 0 },
  groupTitle: { fontWeight: '600' },
  indented: { paddingLeft: spacing.md },
  grow: { flex: 1, minWidth: 0 },
  muted: { fontSize: 11, color: supporting.mutedText, padding: spacing.sm },
});
