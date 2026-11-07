import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

import { Button, DateField, ErrorView, FormField, LoadingView, Notice, Panel, Row, Screen, SelectField, palette } from '@/design-system';

import { CERTAINTY_OPTIONS, PRODUCT_KIND_OPTIONS } from '../../domain/validation';
import { useExpenseFormViewModel, type ExpensePrefill } from '../viewmodels/useExpenseViewModels';
import { useProductFormViewModel } from '../viewmodels/useProductViewModels';
import { useSaleFormViewModel, type SalePrefill } from '../viewmodels/useSalesViewModels';

function VoidedNotice({ reason }: { reason: string | null }) {
  return <Notice title="This record has been voided">{`It no longer counts in your reports. Reason: ${reason ?? 'not given'}.`}</Notice>;
}

export function SaleFormScreen({ saleId, prefill, onDone }: { saleId?: string; prefill?: SalePrefill; onDone: () => void }) {
  const vm = useSaleFormViewModel({ saleId, prefill, onDone });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen>
      {vm.isVoided ? <VoidedNotice reason={vm.voidedReason} /> : null}
      <Panel>
        {vm.productOptions.length > 1 ? <SelectField label="From my catalogue (optional)" value={values.productId} options={vm.productOptions} onChange={vm.selectProduct} disabled={vm.isVoided} /> : null}
        <FormField label="Item or service" value={values.itemName} onChangeText={(v) => setValue('itemName', v)} error={errors.itemName} disabled={vm.isVoided} />
        <DateField label="Date" value={values.occurredOn} onChangeText={(v) => setValue('occurredOn', v)} error={errors.occurredOn} disabled={vm.isVoided} />
        <SelectField label="Category" value={values.category} options={vm.categoryOptions} onChange={(v) => setValue('category', v)} error={errors.category} disabled={vm.isVoided} allowOther />
        <Row>
          <FormField style={styles.grow} label="Quantity" value={values.quantity} onChangeText={(v) => setValue('quantity', v)} error={errors.quantity} keyboardType="decimal-pad" disabled={vm.isVoided} />
          <FormField style={styles.grow} label="Unit (optional)" value={values.unit} onChangeText={(v) => setValue('unit', v)} error={errors.unit} placeholder="e.g. trays" disabled={vm.isVoided} />
        </Row>
        <FormField label="Unit price" value={values.unitPrice} onChangeText={(v) => setValue('unitPrice', v)} error={errors.unitPrice} keyboardType="decimal-pad" disabled={vm.isVoided} />
        <Text style={styles.total} accessibilityLiveRegion="polite">
          Total: {vm.totalPreview}
        </Text>
        <FormField label="Notes (optional)" value={values.notes} onChangeText={(v) => setValue('notes', v)} error={errors.notes} multiline placeholder="Context that will help you understand this later" disabled={vm.isVoided} />
      </Panel>
      {vm.canSave ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          {vm.isEditing ? 'Save changes' : 'Save sale'}
        </Button>
      ) : null}
    </Screen>
  );
}

export function ExpenseFormScreen({ expenseId, prefill, onDone }: { expenseId?: string; prefill?: ExpensePrefill; onDone: () => void }) {
  const vm = useExpenseFormViewModel({ expenseId, prefill, onDone });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen>
      {vm.isVoided ? <VoidedNotice reason={vm.voidedReason} /> : null}
      <Panel>
        <DateField label="Date" value={values.occurredOn} onChangeText={(v) => setValue('occurredOn', v)} error={errors.occurredOn} disabled={vm.isVoided} />
        <SelectField label="Category" value={values.category} options={vm.categoryOptions} onChange={(v) => setValue('category', v)} error={errors.category} disabled={vm.isVoided} allowOther />
        <FormField label="Description" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} disabled={vm.isVoided} />
        <FormField label="Amount" value={values.amount} onChangeText={(v) => setValue('amount', v)} error={errors.amount} keyboardType="decimal-pad" disabled={vm.isVoided} />
        <SelectField label="How sure is this figure?" value={values.certainty} options={CERTAINTY_OPTIONS} onChange={(v) => setValue('certainty', v)} error={errors.certainty} disabled={vm.isVoided} />
        <Row>
          <FormField style={styles.grow} label="Quantity (optional)" value={values.quantity} onChangeText={(v) => setValue('quantity', v)} error={errors.quantity} keyboardType="decimal-pad" disabled={vm.isVoided} />
          <FormField style={styles.grow} label="Unit (optional)" value={values.unit} onChangeText={(v) => setValue('unit', v)} error={errors.unit} placeholder="e.g. kg" disabled={vm.isVoided} />
        </Row>
        <FormField label="Notes (optional)" value={values.notes} onChangeText={(v) => setValue('notes', v)} error={errors.notes} multiline disabled={vm.isVoided} />
      </Panel>
      {vm.canSave ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          {vm.isEditing ? 'Save changes' : 'Save expense'}
        </Button>
      ) : null}
    </Screen>
  );
}

export function ProductFormScreen({ productId, onDone }: { productId?: string; onDone: () => void }) {
  const vm = useProductFormViewModel({ productId, onDone });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;
  const readOnly = !vm.canManage;

  return (
    <Screen>
      <Panel>
        <SelectField label="Type" value={values.kind} options={PRODUCT_KIND_OPTIONS} onChange={(v) => setValue('kind', v)} error={errors.kind} disabled={readOnly} />
        <FormField label="Name" value={values.name} onChangeText={(v) => setValue('name', v)} error={errors.name} disabled={readOnly} />
        <FormField label="Category (optional)" value={values.category} onChangeText={(v) => setValue('category', v)} error={errors.category} disabled={readOnly} />
        <FormField label="Description (optional)" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} multiline disabled={readOnly} />
        <Row>
          <FormField style={styles.grow} label="Unit" value={values.unit} onChangeText={(v) => setValue('unit', v)} error={errors.unit} placeholder="e.g. tray" disabled={readOnly} />
          <FormField style={styles.grow} label="Selling price" value={values.sellingPrice} onChangeText={(v) => setValue('sellingPrice', v)} error={errors.sellingPrice} keyboardType="decimal-pad" disabled={readOnly} />
        </Row>
      </Panel>
      {vm.canManage ? (
        <Button mode="contained" onPress={vm.submit} disabled={vm.busy} loading={vm.busy}>
          {vm.isEditing ? 'Save changes' : 'Add to catalogue'}
        </Button>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  total: { fontWeight: '700', color: palette.deepTeal },
});
