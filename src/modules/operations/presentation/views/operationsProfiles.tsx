import { formatDate, formatQuantity } from '@/core/format/format';
import { AttachmentGallery, Button, ConfirmDialog, DetailPanel, ErrorView, LoadingView, Notice, Panel, ProfileHeader, Screen, supporting } from '@/design-system';

import { useActivityDetailViewModel } from '../viewmodels/useActivityViewModels';
import { useFlockDetailViewModel } from '../viewmodels/useFlockViewModels';
import { activityAmount, STATUS_TONES } from './activityFields';

export function ActivityProfileScreen({ activityId, onEdit }: { activityId: string; onEdit: () => void }) {
  const vm = useActivityDetailViewModel(activityId);
  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.record) return <ErrorView message={vm.error ?? 'This record could not be found.'} />;
  const { record } = vm;

  return (
    <Screen>
      <ProfileHeader
        icon="clipboard-text-outline"
        tone="neutral"
        title={record.activityName}
        subtitle={[formatDate(record.occurredOn), vm.groupName].filter(Boolean).join(' · ')}
        value={activityAmount(record) || undefined}
        struckThrough={vm.isVoided}
        status={{ label: vm.statusLabel, tone: STATUS_TONES[record.status] }}
      />
      {record.status === 'voided' ? <Notice title="This record has been voided">{`It no longer counts in your reports. Reason: ${record.voidReason ?? 'not given'}.`}</Notice> : null}
      {record.status === 'cancelled' ? <Notice title="This activity was cancelled">It did not happen, so it does not count in your reports.</Notice> : null}
      {record.status === 'planned' || record.status === 'in_progress' || record.status === 'requires_review' ? (
        <Notice tone="info">It counts in your reports once it is completed.</Notice>
      ) : null}
      <DetailPanel
        rows={[
          { label: 'Date', value: formatDate(record.occurredOn), half: true },
          { label: 'Flock', value: vm.flockName, half: true },
          ...vm.answers.map((answer) => ({ label: answer.label, value: answer.value, half: true })),
          { label: 'Responsible person', value: vm.responsible, half: true },
          { label: 'Product or service', value: vm.linkedProduct, half: true },
          { label: 'Linked sale', value: vm.linkedSale, half: true },
          { label: 'Linked expense', value: vm.linkedExpense, half: true },
          { label: 'Notes', value: record.notes },
        ]}
      />
      {vm.canComplete ? (
        <Button mode="contained" icon="check" onPress={vm.complete} loading={vm.changingStatus} disabled={vm.changingStatus}>
          Mark as completed
        </Button>
      ) : null}
      {vm.canStart ? (
        <Button mode="outlined" onPress={vm.start} disabled={vm.changingStatus}>
          Mark as in progress
        </Button>
      ) : null}
      {vm.receipts.length > 0 ? (
        <Panel>
          <AttachmentGallery label="Receipts" files={vm.receipts} />
        </Panel>
      ) : null}
      {vm.canEdit ? (
        <Button mode="contained" icon="pencil-outline" onPress={onEdit}>
          Edit record
        </Button>
      ) : null}
      {vm.canVoid ? (
        <Button onPress={vm.askToVoid} textColor={supporting.error}>
          Void this record
        </Button>
      ) : null}
      {vm.canCancel ? (
        <Button onPress={vm.cancel} disabled={vm.changingStatus} textColor={supporting.error}>
          Cancel this activity
        </Button>
      ) : null}
      <ConfirmDialog
        visible={vm.confirmingVoid}
        title="Void this record?"
        message="It stays in your history for audit purposes but stops counting in your reports. This cannot be undone."
        confirmLabel="Void record"
        destructive
        busy={vm.voiding}
        onDismiss={vm.cancelVoid}
        onConfirm={vm.confirmVoid}
        reason={{ label: 'Reason', value: vm.voidReason, onChange: vm.setVoidReason }}
      />
    </Screen>
  );
}

export function FlockProfileScreen({ flockId, onEdit }: { flockId: string; onEdit: () => void }) {
  const vm = useFlockDetailViewModel(flockId);
  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.flock) return <ErrorView message={vm.error ?? 'This flock could not be found.'} />;
  const { flock } = vm;

  return (
    <Screen>
      <ProfileHeader
        icon="egg-outline"
        title={flock.name}
        subtitle={flock.breed ?? undefined}
        status={vm.isActive ? { label: 'Active', tone: 'ok' } : { label: 'Inactive', tone: 'neutral' }}
      />
      <DetailPanel
        rows={[
          { label: 'Breed', value: flock.breed, half: true },
          { label: 'Date acquired', value: flock.acquiredOn ? formatDate(flock.acquiredOn) : null, half: true },
          { label: 'Starting count', value: flock.initialCount === null ? null : formatQuantity(flock.initialCount), half: true },
        ]}
      />
      {vm.canEdit ? (
        <>
          <Button mode="contained" icon="pencil-outline" onPress={onEdit}>
            Edit flock
          </Button>
          <Button onPress={vm.toggleActive} disabled={vm.busy}>
            {vm.isActive ? 'Deactivate flock' : 'Reactivate flock'}
          </Button>
        </>
      ) : null}
    </Screen>
  );
}
