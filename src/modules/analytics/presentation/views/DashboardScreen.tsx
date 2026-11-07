import { StyleSheet, View } from 'react-native';
import { Dialog, Divider, List, Portal, Text } from 'react-native-paper';

import { formatDate, formatQuantity } from '@/core/format/format';
import { Button, BarRow, EmptyState, ErrorView, HeroCard, LabelValue, LoadingView, MetricCard, MetricGrid, Notice, Panel, Row, Screen, SectionHeader, StatusPill, palette, spacing, supporting, IconTile, motion } from '@/design-system';

import { PeriodSelector } from '../components/PeriodSelector';
import { useDashboardViewModel, type PresentedKpi } from '../viewmodels/useAnalyticsViewModels';

const ACTIVITY_TILE = {
  sale: { icon: 'cash-plus', tone: 'mint' },
  expense: { icon: 'cash-minus', tone: 'coral' },
  activity: { icon: 'clipboard-text-outline', tone: 'neutral' },
} as const;

export function DashboardScreen({ onAddRecord, onViewRecords }: { onAddRecord: () => void; onViewRecords: () => void }) {
  const vm = useDashboardViewModel();

  return (
    <Screen refreshing={vm.refreshing} onRefresh={vm.refresh}>
      <HeroCard
        kicker="Welcome to Verida"
        title="Understand your business. Grow with confidence."
        body={`A clearer picture of ${vm.businessName} starts with a few simple records.`}
        action={
          vm.canCreateRecords ? (
            <Button mode="contained" buttonColor={palette.softMint} textColor={palette.deepTeal} icon="plus" onPress={onAddRecord}>
              Add a record
            </Button>
          ) : null
        }
      />

      {vm.isInactive ? <Notice title="This business is not active">Records and reports are paused. The owner can reactivate it under My business.</Notice> : null}

      <PeriodSelector control={vm.periodControl} />

      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.refresh} />
      ) : (
        <>
          <MetricGrid>
            {vm.highlights.map((kpi, index) => (
              <MetricCard key={kpi.code} index={index} label={kpi.name} value={kpi.display} caption={kpi.note ?? vm.period.label} status={kpi.statusChip} onPress={() => vm.selectKpi(kpi.code)} />
            ))}
          </MetricGrid>

          <Panel>
            <SectionHeader title={vm.chartTitle} description="A simple view of the information you've recorded" />
            {vm.bars.hasData ? (
              <>
                <BarRow label="Revenue" ratio={vm.bars.revenue.ratio} value={vm.bars.revenue.display} />
                <BarRow label="Expenses" ratio={vm.bars.expenses.ratio} value={vm.bars.expenses.display} tone="coral" delay={motion.stagger * 2} />
              </>
            ) : (
              <EmptyState illustration="growth" title="Add your first record to see your activity here." />
            )}
          </Panel>

          {vm.otherKpis.length > 0 ? (
            <Panel>
              <SectionHeader title="More measures" description="Tap one to see how it is calculated." />
              {vm.otherKpis.map((kpi, index) => (
                <View key={kpi.code}>
                  {index > 0 ? <Divider /> : null}
                  <List.Item title={kpi.name} description={kpi.note ?? undefined} onPress={() => vm.selectKpi(kpi.code)} right={() => <Text style={styles.kpiValue}>{kpi.display}</Text>} />
                </View>
              ))}
            </Panel>
          ) : null}

          <Panel>
            <SectionHeader title="My Business Health" description="How complete is your business information?" />
            {vm.completeness.map((item) => (
              <Row key={item.item}>
                <IconTile icon={item.isStarted ? 'check' : 'circle-outline'} tone={item.isStarted ? 'mint' : 'neutral'} size={32} />
                <Text variant="bodyMedium" style={styles.grow}>
                  {item.label}
                </Text>
                <StatusPill label={item.isStarted ? 'Started' : 'To set up'} tone={item.isStarted ? 'ok' : 'warn'} />
              </Row>
            ))}
          </Panel>
        </>
      )}

      <SectionHeader
        title="Recent activity"
        description="The latest information you've added"
        action={
          <Button mode="contained-tonal" compact onPress={onViewRecords}>
            View records
          </Button>
        }
      />
      {vm.recent.length === 0 ? (
        <EmptyState illustration="ledger" title="No records yet." description="Add your first business record to begin." />
      ) : (
        <Panel style={styles.list}>
          {vm.recent.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={item.label}
                description={formatDate(item.occurredOn)}
                left={() => <IconTile icon={ACTIVITY_TILE[item.kind].icon} tone={ACTIVITY_TILE[item.kind].tone} />}
                right={() => (
                  <Text style={styles.kpiValue}>{item.amount !== null ? vm.money(item.amount) : `${formatQuantity(item.quantity ?? 0)} ${item.unit ?? ''}`}</Text>
                )}
              />
            </View>
          ))}
        </Panel>
      )}

      <KpiDetailDialog kpi={vm.selectedKpi} onDismiss={() => vm.selectKpi(null)} />
    </Screen>
  );
}

// FR-E14: what a KPI means, how it is calculated, and what it needs.
function KpiDetailDialog({ kpi, onDismiss }: { kpi: PresentedKpi | null; onDismiss: () => void }) {
  return (
    <Portal>
      <Dialog visible={kpi !== null} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>{kpi?.name}</Dialog.Title>
        <Dialog.Content style={styles.dialogBody}>
          {kpi ? (
            <>
              <Row>
                <Text variant="headlineSmall" style={styles.dialogValue}>
                  {kpi.display}
                </Text>
                <StatusPill label={kpi.statusChip.label} tone={kpi.statusChip.tone} />
              </Row>
              {kpi.note ? <Notice>{kpi.note}</Notice> : null}
              <Text variant="bodyMedium">{kpi.explanation}</Text>
              <LabelValue label="How it is calculated" value={kpi.formulaText} />
              <LabelValue label="What it needs" value={kpi.requiredData} />
            </>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Close</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.xs, gap: 0 },
  grow: { flex: 1 },
  kpiValue: { fontWeight: '700', color: palette.deepTeal, alignSelf: 'center', marginLeft: spacing.md },
  dialog: { backgroundColor: supporting.white, maxWidth: 480, width: '90%', alignSelf: 'center' },
  dialogBody: { gap: spacing.md },
  dialogValue: { fontWeight: '800', color: palette.deepTeal },
});
