import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Divider, List, Searchbar, Text } from 'react-native-paper';

import { formatDate, formatQuantity } from '@/core/format/format';
import { DATE_RANGE_OPTIONS } from '@/core/time/dateRange';
import { AttachmentsField, Button, CsvImportScreen, DataTable, DateField, EmptyState, ErrorView, FieldGrid, FormField, LoadingView, Notice, Panel, Row, Screen, SelectField, StatusPill, palette, spacing, supporting, useWideLayout } from '@/design-system';

import { useActivityImportViewModel } from '../viewmodels/useActivityImportViewModel';
import { useActivityFormViewModel, useActivityListViewModel, type ActivityPrefill } from '../viewmodels/useActivityViewModels';
import { useFlockFormViewModel, useFlockListViewModel } from '../viewmodels/useFlockViewModels';

export function ImportActivityScreen({ onDone }: { onDone: () => void }) {
  const vm = useActivityImportViewModel(onDone);
  return (
    <CsvImportScreen
      title="Import activity records"
      columns={vm.columns}
      example={vm.example}
      fileName={vm.fileName}
      analysis={vm.analysis}
      error={vm.error}
      canCommit={vm.canCommit && vm.canImport}
      committing={vm.committing}
      onChooseFile={vm.chooseFile}
      onCommit={vm.commit}
    />
  );
}

type ActivityListProps = {
  header?: ReactNode;
  onCreate: () => void;
  onImport: () => void;
  onOpen: (id: string) => void;
  onOpenFlocks: () => void;
};

export function ActivityList({ header, onCreate, onImport, onOpen, onOpenFlocks }: ActivityListProps) {
  const vm = useActivityListViewModel();
  const wide = useWideLayout();
  return (
    <Screen refreshing={vm.refreshing} onRefresh={vm.refresh}>
      {wide && header ? <View style={styles.segment}>{header}</View> : header}
      <Row wrap>
        {vm.canCreate ? (
          <Button mode="contained" icon="plus" onPress={onCreate}>
            Add activity
          </Button>
        ) : null}
        {vm.usesFlocks ? (
          <Button mode="outlined" icon="egg-outline" onPress={onOpenFlocks}>
            My flocks
          </Button>
        ) : null}
        {vm.canCreate ? (
          <Button mode="outlined" icon="upload" accessibilityLabel="Import CSV" onPress={onImport}>
            Import
          </Button>
        ) : null}
      </Row>
      <Row gap={spacing.sm}>
        <View style={styles.grow}>
          <SelectField label="Show" value={vm.activityTypeId} options={vm.typeOptions} onChange={vm.setActivityTypeId} />
        </View>
        <View style={styles.grow}>
          <SelectField label="Date" value={vm.dateRange} options={DATE_RANGE_OPTIONS} onChange={vm.setDateRange} />
        </View>
      </Row>
      <Searchbar placeholder="Search notes" value={vm.search} onChangeText={vm.setSearch} style={styles.search} />
      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.refresh} />
      ) : vm.items.length === 0 ? (
        <EmptyState illustration="ledger" title="No activity recorded yet." description="One day is a snapshot. A series of records reveals a pattern." />
      ) : wide ? (
        <DataTable
          rows={vm.items}
          rowKey={(record) => record.id}
          onRowPress={(record) => onOpen(record.id)}
          rowLabel={(record) => record.activityName}
          isMuted={(record) => record.status === 'voided'}
          columns={[
            { key: 'date', title: 'Date', render: (record) => formatDate(record.occurredOn) },
            { key: 'activity', title: 'Activity', render: (record) => record.activityName, flex: 2 },
            ...(vm.usesFlocks ? [{ key: 'flock', title: 'Flock', render: (record: (typeof vm.items)[number]) => vm.flockNameOf(record.flockId) ?? '—' }] : []),
            { key: 'notes', title: 'Notes', render: (record) => record.notes ?? '', flex: 2 },
            {
              key: 'quantity',
              title: 'Quantity',
              align: 'right',
              flex: 1.2,
              render: (record) => (record.status === 'voided' ? <StatusPill label="Voided" tone="danger" /> : <Text style={styles.quantity}>{`${formatQuantity(record.quantity)} ${record.unit}`}</Text>),
            },
          ]}
        />
      ) : (
        <Panel style={styles.list}>
          {vm.items.map((record, index) => {
            const flockName = vm.flockNameOf(record.flockId);
            const voided = record.status === 'voided';
            return (
              <View key={record.id}>
                {index > 0 ? <Divider /> : null}
                <List.Item
                  title={record.activityName}
                  titleStyle={voided ? styles.voided : undefined}
                  description={`${formatDate(record.occurredOn)}${flockName ? ` · ${flockName}` : ''}`}
                  onPress={() => onOpen(record.id)}
                  right={() => (
                    <View style={styles.rowEnd}>
                      <Text style={[styles.quantity, voided && styles.voided]}>
                        {formatQuantity(record.quantity)} {record.unit}
                      </Text>
                      {voided ? <StatusPill label="Voided" tone="danger" /> : null}
                    </View>
                  )}
                />
              </View>
            );
          })}
        </Panel>
      )}
    </Screen>
  );
}

export function ActivityFormScreen({ activityId, prefill, onDone }: { activityId?: string; prefill?: ActivityPrefill; onDone: () => void }) {
  const vm = useActivityFormViewModel({ activityId, prefill, onDone });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen variant="form">
      {vm.isVoided ? <Notice title="This record has been voided">{`It no longer counts in your reports. Reason: ${vm.voidedReason ?? 'not given'}.`}</Notice> : null}
      <Panel>
        <SelectField label="What are you recording?" value={values.activityTypeId} options={vm.typeOptions} onChange={vm.selectType} error={errors.activityTypeId} hint={vm.typeDescription} disabled={vm.isVoided} />
        <FieldGrid>
          <DateField label="Date" value={values.occurredOn} onChangeText={(v) => setValue('occurredOn', v)} error={errors.occurredOn} disabled={vm.isVoided} />
          {vm.showFlock ? <SelectField label="Flock" value={values.flockId} options={vm.flockOptions} onChange={(v) => setValue('flockId', v)} disabled={vm.isVoided} /> : null}
          <Row>
            <FormField style={styles.grow} label="Quantity" value={values.quantity} onChangeText={(v) => setValue('quantity', v)} error={errors.quantity} keyboardType="numbers-and-punctuation" disabled={vm.isVoided} />
            <FormField style={styles.grow} label="Unit" value={values.unit} onChangeText={(v) => setValue('unit', v)} error={errors.unit} disabled={vm.isVoided} />
          </Row>
        </FieldGrid>
        <FormField label="Notes (optional)" value={values.notes} onChangeText={(v) => setValue('notes', v)} error={errors.notes} multiline disabled={vm.isVoided} />
      </Panel>
      <Panel>
        <AttachmentsField
          label="Receipts or evidence (optional)"
          hint="Photos or PDFs that back up this record, up to 10. Only people in this business can see them."
          files={vm.receipt.files}
          uploading={vm.receipt.uploading}
          error={vm.receipt.error}
          allowPdf
          full={vm.receipt.full}
          disabled={!vm.canSave}
          onTakePhoto={vm.receipt.takePhoto}
          onChoosePhoto={vm.receipt.choosePhoto}
          onChooseDocument={vm.receipt.chooseDocument}
          onRemove={vm.receipt.remove}
        />
      </Panel>
      {vm.canSave ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          {vm.isEditing ? 'Save changes' : 'Save record'}
        </Button>
      ) : null}
    </Screen>
  );
}

export function FlockListScreen({ onCreate, onOpen }: { onCreate: () => void; onOpen: (id: string) => void }) {
  const vm = useFlockListViewModel();
  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;
  return (
    <Screen>
      {vm.canCreate ? (
        <Button mode="contained" icon="plus" onPress={onCreate}>
          Register a flock
        </Button>
      ) : null}
      {vm.items.length === 0 ? (
        <EmptyState illustration="poultry" title="No flocks registered." description="With more than one flock, registering them keeps each laying rate separate." />
      ) : (
        <Panel style={styles.list}>
          {vm.items.map((flock, index) => (
            <View key={flock.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={flock.name}
                description={[flock.breed, flock.initialCount === null ? null : `Started with ${formatQuantity(flock.initialCount)}`].filter(Boolean).join(' · ') || undefined}
                onPress={() => onOpen(flock.id)}
                right={() => (flock.isActive ? null : <StatusPill label="Inactive" tone="neutral" />)}
              />
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

export function FlockFormScreen({ flockId, onDone }: { flockId?: string; onDone: () => void }) {
  const vm = useFlockFormViewModel({ flockId, onDone });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;
  const readOnly = !vm.canEdit;

  return (
    <Screen variant="form">
      <Panel>
        <FieldGrid>
          <FormField label="Flock name" value={values.name} onChangeText={(v) => setValue('name', v)} error={errors.name} disabled={readOnly} />
          <FormField label="Breed (optional)" value={values.breed} onChangeText={(v) => setValue('breed', v)} error={errors.breed} disabled={readOnly} />
          <DateField label="Date acquired (optional)" value={values.acquiredOn} onChangeText={(v) => setValue('acquiredOn', v)} error={errors.acquiredOn} disabled={readOnly} />
          <FormField label="Starting count (optional)" value={values.initialCount} onChangeText={(v) => setValue('initialCount', v)} error={errors.initialCount} keyboardType="number-pad" disabled={readOnly} />
        </FieldGrid>
      </Panel>
      {vm.canEdit ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.busy} disabled={vm.busy}>
          {vm.isEditing ? 'Save changes' : 'Register flock'}
        </Button>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { backgroundColor: supporting.white, borderWidth: 1, borderColor: supporting.line },
  list: { padding: spacing.xs, gap: 0 },
  rowEnd: { alignItems: 'flex-end', justifyContent: 'center', gap: spacing.xs },
  quantity: { fontWeight: '700', color: palette.deepTeal },
  voided: { textDecorationLine: 'line-through', color: supporting.mutedText },
  grow: { flex: 1, minWidth: 0 },
  segment: { maxWidth: 440 },
});
