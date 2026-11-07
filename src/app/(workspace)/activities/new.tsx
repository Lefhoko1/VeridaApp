import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { ActivityFormScreen } from '@/modules/operations';

// Parameters come from Ask Verida. The user reviews them in the form before saving.
export default function NewActivityRoute() {
  const { activity, quantity, unit, occurredOn } = useLocalSearchParams<Record<string, string>>();
  const prefill = {
    ...(activity ? { activity } : {}),
    ...(quantity ? { quantity } : {}),
    ...(unit ? { unit } : {}),
    ...(occurredOn ? { occurredOn } : {}),
  };
  return <ActivityFormScreen prefill={prefill} onDone={goBack} />;
}
