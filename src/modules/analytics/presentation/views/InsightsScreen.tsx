import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

import { Button, CardGrid, EmptyState, ErrorView, GroupedBarChart, Kicker, LoadingView, Notice, Panel, Screen, SectionHeader, supporting, HeroCard, IconTile, Row, spacing, type TileTone } from '@/design-system';

import type { Insight, InsightKind } from '../../domain/models';
import { PeriodSelector } from '../components/PeriodSelector';
import { useInsightsViewModel } from '../viewmodels/useAnalyticsViewModels';

const KIND: Record<InsightKind, { label: string; icon: string; tone: TileTone }> = {
  fact: { label: 'Observed fact', icon: 'check-circle-outline', tone: 'mint' },
  interpretation: { label: 'Interpretation', icon: 'lightbulb-on-outline', tone: 'mint' },
  recommendation: { label: 'Recommendation', icon: 'arrow-top-right', tone: 'coral' },
  data_quality: { label: 'Data quality', icon: 'database-alert-outline', tone: 'neutral' },
};

// Plan journey 5.3: from an insight to planned actions. The routes decide where these open.
type InsightsProps = { onPlanAction?: (insight: Insight) => void; onPlanFromFigures?: () => void };

export function InsightsScreen({ onPlanAction, onPlanFromFigures }: InsightsProps) {
  const vm = useInsightsViewModel();

  return (
    <Screen refreshing={vm.refreshing} onRefresh={vm.refresh}>
      <HeroCard kicker="My insights" title="See what your records are telling you." body="Patterns and suggestions, drawn only from what you have entered." />
      <PeriodSelector control={vm.periodControl} />
      {onPlanFromFigures && vm.canPlan ? (
        <Button mode="contained" icon="calendar-check-outline" onPress={onPlanFromFigures}>
          Plan actions from my figures
        </Button>
      ) : null}

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
            {onPlanAction && vm.canPlan ? (
              <Button compact mode="outlined" icon="calendar-check-outline" onPress={() => onPlanAction(insight)}>
                Plan an action
              </Button>
            ) : null}
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
