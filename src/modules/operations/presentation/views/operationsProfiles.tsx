import { formatDate, formatQuantity } from '@/core/format/format';
import { AttachmentGallery, Button, ConfirmDialog, DetailPanel, ErrorView, LoadingView, Notice, Panel, ProfileHeader, Screen, supporting } from '@/design-system';

import { useActivityDetailViewModel } from '../viewmodels/useActivityViewModels';
import { useFlockDetailViewModel } from '../viewmodels/useFlockViewModels';

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
        subtitle={formatDate(record.occurredOn)}
        value={`${formatQuantity(record.quantity)} ${record.unit}`}
        struckThrough={vm.isVoided}
        status={vm.isVoided ? { label: 'Voided', tone: 'danger' } : { label: 'Recorded', tone: 'ok' }}
      />
      {vm.isVoided ? <Notice title="This record has been voided">{`It no longer counts in your reports. Reason: ${record.voidReason ?? 'not given'}.`}</Notice> : null}
      <DetailPanel
        rows={[
          { label: 'Date', value: formatDate(record.occurredOn), half: true },
          { label: 'Flock', value: vm.flockName, half: true },
          { label: 'Notes', value: record.notes },
        ]}
      />
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
