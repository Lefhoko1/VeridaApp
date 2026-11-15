import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

import { CardGrid, EmptyState, ErrorView, GroupedBarChart, Kicker, LoadingView, Notice, Panel, Screen, SectionHeader, supporting, HeroCard, IconTile, Row, spacing, type TileTone } from '@/design-system';

import type { InsightKind } from '../../domain/models';
import { PeriodSelector } from '../components/PeriodSelector';
import { useInsightsViewModel } from '../viewmodels/useAnalyticsViewModels';

const KIND: Record<InsightKind, { label: string; icon: string; tone: TileTone }> = {
  fact: { label: 'Observed fact', icon: 'check-circle-outline', tone: 'mint' },
  interpretation: { label: 'Interpretation', icon: 'lightbulb-on-outline', tone: 'mint' },
  recommendation: { label: 'Recommendation', icon: 'arrow-top-right', tone: 'coral' },
  data_quality: { label: 'Data quality', icon: 'database-alert-outline', tone: 'neutral' },
};

export function InsightsScreen() {
  const vm = useInsightsViewModel();

  return (
    <Screen refreshing={vm.refreshing} onRefresh={vm.refresh}>
      <HeroCard kicker="My insights" title="See what your records are telling you." body="Patterns and suggestions, drawn only from what you have entered." />
      <PeriodSelector control={vm.periodControl} />

      <Panel>
        <SectionHeader title="Monthly pattern" description="Recorded revenue and expenses by month" />
        {vm.hasChartData ? (
          <GroupedBarChart data={vm.chart} primaryLabel="Revenue" secondaryLabel="Expenses" />
        ) : (
          <EmptyState illustration="growth" title="As you record sales and expenses, Verida will show patterns over time." />
        )}
      </Panel>

      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.refresh} />
      ) : (
        <CardGrid>
          {vm.insights.map((insight) => (
          <Panel key={insight.id}>
            <Row gap={spacing.sm}>
              <IconTile icon={KIND[insight.kind].icon} tone={KIND[insight.kind].tone} size={32} />
              <Kicker>{KIND[insight.kind].label}</Kicker>
            </Row>
            <Text variant="titleMedium">{insight.title}</Text>
            <Text variant="bodySmall" style={styles.body}>
              {insight.body}
            </Text>
            <Text style={styles.evidence}>Based on: {insight.evidence}</Text>
          </Panel>
          ))}
        </CardGrid>
      )}

      <Notice tone="info">Insights are generated from the records entered in Verida. They are not financial advice and do not infer missing information.</Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: supporting.mutedText },
  evidence: { fontSize: 12, color: supporting.neutralText, fontStyle: 'italic' },
});
