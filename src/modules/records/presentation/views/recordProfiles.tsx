import { AttachmentGallery, AttachmentPreview, Button, ConfirmDialog, DetailPanel, ErrorView, LoadingView, Notice, Panel, ProfileHeader, Row, Screen, spacing, supporting } from '@/design-system';
import { formatDate, formatQuantity } from '@/core/format/format';

import { CERTAINTY_OPTIONS, PRODUCT_KIND_OPTIONS } from '../../domain/validation';
import { useExpenseDetailViewModel } from '../viewmodels/useExpenseViewModels';
import { useProductDetailViewModel } from '../viewmodels/useProductViewModels';
import { useSaleDetailViewModel } from '../viewmodels/useSalesViewModels';

const labelOf = (options: { value: string; label: string }[], value: string) => options.find((option) => option.value === value)?.label ?? value;

function VoidedNotice({ reason }: { reason: string | null }) {
  return <Notice title="This record has been voided">{`It no longer counts in your reports. Reason: ${reason ?? 'not given'}.`}</Notice>;
}

export function SaleProfileScreen({ saleId, onEdit }: { saleId: string; onEdit: () => void }) {
  const vm = useSaleDetailViewModel(saleId);
  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.sale) return <ErrorView message={vm.error ?? 'This sale could not be found.'} />;
  const { sale } = vm;
  const quantity = `${formatQuantity(sale.quantity)}${sale.unit ? ` ${sale.unit}` : ''}`;

  return (
    <Screen>
      <ProfileHeader
        icon="cash-plus"
        title={sale.itemName}
        subtitle={formatDate(sale.occurredOn)}
        value={vm.money(sale.totalAmount)}
        struckThrough={vm.isVoided}
        status={vm.isVoided ? { label: 'Voided', tone: 'danger' } : { label: 'Recorded', tone: 'ok' }}
      />
      {vm.isVoided ? <VoidedNotice reason={sale.voidReason} /> : null}
      <DetailPanel
        rows={[
          { label: 'Category', value: sale.category, half: true },
          { label: 'Date', value: formatDate(sale.occurredOn), half: true },
          { label: 'Quantity', value: quantity, half: true },
          { label: 'Unit price', value: vm.money(sale.unitPrice), half: true },
          { label: 'Notes', value: sale.notes },
        ]}
      />
      {vm.receipts.length > 0 ? (
        <Panel>
          <AttachmentGallery label="Receipts" files={vm.receipts} />
        </Panel>
      ) : null}
      {vm.canEdit ? (
        <Button mode="contained" icon="pencil-outline" onPress={onEdit}>
          Edit sale
        </Button>
      ) : null}
      {vm.canVoid ? (
        <Button onPress={vm.askToVoid} textColor={supporting.error}>
          Void this sale
        </Button>
      ) : null}
      <ConfirmDialog
        visible={vm.confirmingVoid}
        title="Void this sale?"
        message="It stays in your history for audit purposes but stops counting in your reports. This cannot be undone."
        confirmLabel="Void sale"
        destructive
        busy={vm.voiding}
        onDismiss={vm.cancelVoid}
        onConfirm={vm.confirmVoid}
        reason={{ label: 'Reason', value: vm.voidReason, onChange: vm.setVoidReason }}
      />
    </Screen>
  );
}

export function ExpenseProfileScreen({ expenseId, onEdit }: { expenseId: string; onEdit: () => void }) {
  const vm = useExpenseDetailViewModel(expenseId);
  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.expense) return <ErrorView message={vm.error ?? 'This expense could not be found.'} />;
  const { expense } = vm;
  const quantity = expense.quantity === null ? null : `${formatQuantity(expense.quantity)}${expense.unit ? ` ${expense.unit}` : ''}`;

  return (
    <Screen>
      <ProfileHeader
        icon="cash-minus"
        tone="coral"
        title={expense.description}
        subtitle={formatDate(expense.occurredOn)}
        value={vm.money(expense.amount)}
        struckThrough={vm.isVoided}
        status={vm.isVoided ? { label: 'Voided', tone: 'danger' } : { label: 'Recorded', tone: 'ok' }}
      />
      {vm.isVoided ? <VoidedNotice reason={expense.voidReason} /> : null}
      <DetailPanel
        rows={[
          { label: 'Category', value: expense.category, half: true },
          { label: 'Date', value: formatDate(expense.occurredOn), half: true },
          { label: 'How sure is this figure?', value: labelOf(CERTAINTY_OPTIONS, expense.certainty), half: true },
          { label: 'Quantity', value: quantity, half: true },
          { label: 'Notes', value: expense.notes },
        ]}
      />
      {vm.receipts.length > 0 ? (
        <Panel>
          <AttachmentGallery label="Receipts" files={vm.receipts} />
        </Panel>
      ) : null}
      {vm.canEdit ? (
        <Button mode="contained" icon="pencil-outline" onPress={onEdit}>
          Edit expense
        </Button>
      ) : null}
      {vm.canVoid ? (
        <Button onPress={vm.askToVoid} textColor={supporting.error}>
          Void this expense
        </Button>
      ) : null}
      <ConfirmDialog
        visible={vm.confirmingVoid}
        title="Void this expense?"
        message="It stays in your history for audit purposes but stops counting in your reports. This cannot be undone."
        confirmLabel="Void expense"
        destructive
        busy={vm.voiding}
        onDismiss={vm.cancelVoid}
        onConfirm={vm.confirmVoid}
        reason={{ label: 'Reason', value: vm.voidReason, onChange: vm.setVoidReason }}
      />
    </Screen>
  );
}

export function ProductProfileScreen({ productId, onEdit, onRemoved }: { productId: string; onEdit: () => void; onRemoved: () => void }) {
  const vm = useProductDetailViewModel({ productId, onRemoved });
  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.product) return <ErrorView message={vm.error ?? 'This item could not be found.'} />;
  const { product } = vm;

  return (
    <Screen>
      <ProfileHeader
        icon={product.kind === 'service' ? 'room-service-outline' : 'tag-outline'}
        title={product.name}
        subtitle={labelOf(PRODUCT_KIND_OPTIONS, product.kind)}
        value={`${vm.money(product.sellingPrice)} per ${product.unit}`}
        status={vm.isActive ? { label: 'Active', tone: 'ok' } : { label: 'Inactive', tone: 'neutral' }}
      />
      <DetailPanel
        rows={[
          { label: 'Category', value: product.category, half: true },
          { label: 'Unit', value: product.unit, half: true },
          { label: 'Description', value: product.description },
        ]}
      />
      {vm.image.url ? (
        <Panel>
          <AttachmentPreview label="Photo" url={vm.image.url} isPdf={false} shape="square" />
        </Panel>
      ) : null}
      {vm.canManage ? (
        <>
          <Button mode="contained" icon="pencil-outline" onPress={onEdit}>
            Edit item
          </Button>
          <Row wrap gap={spacing.sm}>
            <Button onPress={vm.toggleActive} disabled={vm.busy}>
              {vm.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
            <Button onPress={vm.askToRemove} disabled={vm.busy} textColor={supporting.error}>
              Delete
            </Button>
          </Row>
        </>
      ) : null}
      <ConfirmDialog
        visible={vm.confirmingRemove}
        title="Delete this item?"
        message="Items with recorded sales cannot be deleted. Deactivate them instead to keep your history intact."
        confirmLabel="Delete"
        destructive
        busy={vm.busy}
        onDismiss={vm.cancelRemove}
        onConfirm={vm.confirmRemove}
      />
    </Screen>
  );
}
