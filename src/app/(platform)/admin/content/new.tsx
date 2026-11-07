import { goBack } from '@/composition/navigation';
import { ContentFormScreen } from '@/modules/learning';

export default function NewContentRoute() {
  return <ContentFormScreen onDone={goBack} />;
}
