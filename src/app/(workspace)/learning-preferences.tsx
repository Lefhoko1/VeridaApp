import { goBack } from '@/composition/navigation';
import { LearnerProfileScreen } from '@/modules/learning';

export default function LearningPreferencesRoute() {
  return <LearnerProfileScreen onDone={goBack} />;
}
