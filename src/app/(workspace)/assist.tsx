import { router, useLocalSearchParams } from 'expo-router';

import { PlanAssistScreen } from '@/modules/plan';

export default function PlanAssistRoute() {
  const { kind, goal, insightTitle, insightBody, insightEvidence, insightKpi } = useLocalSearchParams<{
    kind?: string;
    goal?: string;
    insightTitle?: string;
    insightBody?: string;
    insightEvidence?: string;
    insightKpi?: string;
  }>();
  // Plan journey 5.3: opened from an insight on the Insights screen.
  const insight = insightTitle ? { title: insightTitle, body: insightBody ?? '', evidence: insightEvidence ?? '', kpiCode: insightKpi || null } : undefined;
  return (
    <PlanAssistScreen
      kind={insight || kind === 'insight_actions' ? 'insight_actions' : goal ? 'goal_breakdown' : undefined}
      goalId={goal}
      insight={insight}
      onDone={(id) => router.replace({ pathname: '/suggestions/[id]', params: { id } })}
    />
  );
}
