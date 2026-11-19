import { router } from 'expo-router';

import { InsightsScreen } from '@/modules/analytics';

export default function InsightsRoute() {
  return (
    <InsightsScreen
      onPlanAction={(insight) =>
        router.push({
          pathname: '/assist',
          params: { insightTitle: insight.title, insightBody: insight.body, insightEvidence: insight.evidence, insightKpi: insight.kpiCode ?? '' },
        })
      }
      onPlanFromFigures={() => router.push({ pathname: '/assist', params: { kind: 'insight_actions' } })}
    />
  );
}
