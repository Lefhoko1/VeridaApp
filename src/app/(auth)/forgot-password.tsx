import { goBack } from '@/composition/navigation';
import { ForgotPasswordScreen } from '@/modules/account';

export default function ForgotPasswordRoute() {
  return <ForgotPasswordScreen onBack={goBack} />;
}
